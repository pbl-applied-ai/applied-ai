// 링크 넣기·처리 중·결과는 항상 실제 Supabase RPC로 부른다.
// 로그인·저장·레시피북은 recipeBook이 켜졌을 때만 실제로 부르고(KAN-23·24), 꺼져 있으면 목(base)을 그대로 쓴다.
// supabase-js 없이 PostgREST를 fetch로 부른다. anon 키는 공개해도 되는 키다(권한은 RLS·RPC grant가 막는다).
import { checkUploadFile } from '../upload';
import { createAuth } from './auth';
import { unconfirmedCount } from './editable';
import { NotSignedInError } from './types';
import type { EditableIngredient, EditableRecipe, EditableStep, Job, RecipeApi, RecipeSummary, Run, TeamRecipe, UserRecipe } from './types';

export interface SupabaseOptions {
  url: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  recipeBook?: boolean; // 배포 DB에 저장 RPC가 들어가고 구글 로그인을 설정한 뒤 켠다
  navigate?: (url: string) => void;
  origin?: string;
}

interface JobRow {
  id: string;
  status: Job['status'];
  stage: Job['stage'];
  error_code: Job['errorCode'];
  reason: string | null;
  run_id: string | null;
  created_at: string;
}

interface RunRow {
  id: string;
  source_url: string;
  recipe: TeamRecipe;
  created_at: string;
}

interface MyJobRow extends JobRow {
  source_url: string;
}

interface RecipeRow {
  id: string;
  run_id: string;
  source_url: string;
  title: string;
  servings_raw: string | null;
  ingredients: EditableIngredient[];
  steps: EditableStep[];
  created_at: string;
  updated_at: string;
}

interface RecipeListRow {
  id: string;
  run_id: string;
  title: string;
  ingredients: EditableIngredient[];
  created_at: string;
}

// 업로드로 만든 결과는 원본을 지워서 열 링크가 없다(source_url은 upload:<uuid>)
const publicSource = (sourceUrl: string) => (sourceUrl.startsWith('upload:') ? '' : sourceUrl);

// 목 레시피북에 저장할 때 원본 링크를 채우려고 runId → 링크를 기억해 둔다(목은 실제 run을 모른다).
const SOURCE_KEY = 'supabase-run-sources-v1';

export function createSupabaseApi(base: RecipeApi, options: SupabaseOptions): RecipeApi {
  const apiBase = options.url.replace(/\/$/, '');
  const endpoint = `${apiBase}/rest/v1/rpc`;
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const auth = options.recipeBook
    ? createAuth({ url: apiBase, anonKey: options.anonKey, fetchImpl, storage, navigate: options.navigate, origin: options.origin })
    : null;

  // signedIn이면 로그인 필수. 아니면 로그인했을 때만 토큰을 실어 보낸다(create_job이 내 작업으로 남도록).
  async function bearer(signedIn: boolean): Promise<string> {
    const token = await auth?.accessToken();
    if (signedIn && !token) throw new NotSignedInError();
    return token ?? options.anonKey;
  }

  async function rpc<T>(name: string, args: Record<string, unknown>, signedIn = false): Promise<T | null> {
    const res = await fetchImpl(`${endpoint}/${name}`, {
      method: 'POST',
      headers: { apikey: options.anonKey, authorization: `Bearer ${await bearer(signedIn)}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    if (!res.ok) {
      if (signedIn && (res.status === 401 || res.status === 403)) throw new NotSignedInError();
      // 22P02 = uuid가 아님. 예전 목 결과 주소(/r/run-...)를 열면 여기로 온다 → 결과 없음으로 처리
      if (res.status === 400 && text.includes('22P02')) return null;
      throw new Error(`rpc ${name} ${res.status}: ${text.slice(0, 200)}`);
    }
    return text ? (JSON.parse(text) as T) : null;
  }

  function sources(): Record<string, string> {
    try {
      return JSON.parse(storage?.getItem(SOURCE_KEY) ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  }
  function rememberSource(runId: string, sourceUrl: string): void {
    try {
      storage?.setItem(SOURCE_KEY, JSON.stringify({ ...sources(), [runId]: sourceUrl }));
    } catch {
      // 저장소가 막혀도 원본 링크만 빠진다
    }
  }
  const withSource = (recipe: UserRecipe): UserRecipe =>
    recipe.sourceUrl ? recipe : { ...recipe, sourceUrl: sources()[recipe.runId] ?? '' };

  // 표 직접 읽기·지우기. 내 것만 보이는 건 RLS가 막는다.
  async function table<T>(path: string, method: 'GET' | 'DELETE' = 'GET'): Promise<T> {
    const res = await fetchImpl(`${apiBase}/rest/v1/${path}`, {
      method,
      headers: { apikey: options.anonKey, authorization: `Bearer ${await bearer(true)}` },
    });
    if (res.status === 401 || res.status === 403) throw new NotSignedInError();
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} ${res.status}: ${text.slice(0, 200)}`);
    return (text ? JSON.parse(text) : null) as T;
  }

  const recipeArgs = (draft: EditableRecipe) => ({
    p_title: draft.title,
    p_servings_raw: draft.servingsRaw,
    p_ingredients: draft.ingredients,
    p_steps: draft.steps,
  });

  const demo: RecipeApi = {
    ...base,

    async createJob(sourceUrl) {
      const id = await rpc<string>('create_job', { p_source_url: sourceUrl.trim() });
      if (!id) throw new Error('create_job returned no id');
      return { jobId: id };
    },

    // 비공개 버킷 uploads에 incoming/<uuid>.<확장자>로 올린 뒤 job을 만든다. anon은 올리기만 된다(supabase/migrations).
    async createUploadJob(file) {
      const check = checkUploadFile(file);
      if (!check.ok) throw new Error(`invalid upload: ${check.reason}`);
      const path = `incoming/${crypto.randomUUID()}.${check.ext}`;
      const res = await fetchImpl(`${apiBase}/storage/v1/object/uploads/${path}`, {
        method: 'POST',
        headers: { apikey: options.anonKey, authorization: `Bearer ${options.anonKey}`, 'content-type': check.mime, 'x-upsert': 'false' },
        body: file,
      });
      if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const id = await rpc<string>('create_upload_job', { p_upload_path: path });
      if (!id) throw new Error('create_upload_job returned no id');
      return { jobId: id };
    },

    async getJob(jobId) {
      const rows = await rpc<JobRow[]>('get_job', { p_job_id: jobId });
      const row = rows?.[0];
      if (!row) return null;
      return {
        id: row.id,
        sourceUrl: '', // get_job은 링크를 주지 않는다
        status: row.status,
        stage: row.stage,
        errorCode: row.error_code,
        reason: row.reason,
        runId: row.run_id,
        createdAt: row.created_at,
      };
    },

    async getRun(runId): Promise<Run | null> {
      const rows = await rpc<RunRow[]>('get_run', { p_run_id: runId });
      const row = rows?.[0];
      if (!row) return null;
      const sourceUrl = publicSource(row.source_url);
      rememberSource(row.id, sourceUrl);
      return { id: row.id, sourceUrl, recipe: row.recipe, createdAt: row.created_at };
    },

    async getRecipe(id) {
      const recipe = await base.getRecipe(id);
      return recipe ? withSource(recipe) : null;
    },
  };

  if (!auth) return demo;

  return {
    ...demo,

    getUser: () => auth.user(),
    signInWithGoogle: (returnTo) => auth.signIn(returnTo),
    completeSignIn: (code) => auth.complete(code),
    signInReturnTo: () => auth.returnTo(),
    signOut: () => auth.signOut(),

    async listMyJobs() {
      const rows = await table<MyJobRow[]>('jobs?select=id,source_url,status,stage,error_code,reason,run_id,created_at&order=created_at.desc&limit=100');
      return rows.map((row) => ({
        id: row.id,
        sourceUrl: publicSource(row.source_url),
        status: row.status,
        stage: row.stage,
        errorCode: row.error_code,
        reason: row.reason,
        runId: row.run_id,
        createdAt: row.created_at,
      }));
    },

    async saveRecipe(draft) {
      const id = await rpc<string>('save_recipe', { p_run_id: draft.runId, ...recipeArgs(draft) }, true);
      if (!id) throw new Error('save_recipe returned no id');
      return { id };
    },

    async listRecipes(): Promise<RecipeSummary[]> {
      const rows = await table<RecipeListRow[]>('user_recipes?select=id,run_id,title,ingredients,created_at&order=created_at.desc');
      return rows.map((row) => ({
        id: row.id,
        runId: row.run_id,
        title: row.title,
        ingredientCount: row.ingredients.length,
        unconfirmedCount: unconfirmedCount({ ingredients: row.ingredients }),
        createdAt: row.created_at,
      }));
    },

    async getRecipe(id) {
      const row = (await rpc<RecipeRow[]>('get_recipe', { p_id: id }, true))?.[0];
      if (!row) return null;
      return {
        id: row.id,
        runId: row.run_id,
        sourceUrl: publicSource(row.source_url),
        title: row.title,
        servingsRaw: row.servings_raw,
        ingredients: row.ingredients,
        steps: row.steps,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    async updateRecipe(id, draft) {
      await rpc<null>('update_recipe', { p_id: id, ...recipeArgs(draft) }, true);
    },

    async deleteRecipe(id) {
      await table<null>(`user_recipes?id=eq.${encodeURIComponent(id)}`, 'DELETE');
    },
  };
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
