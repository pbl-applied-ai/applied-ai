// 링크 넣기·처리 중·결과는 항상 실제 Supabase RPC로 부른다.
// 로그인·저장·레시피북은 recipeBook이 켜졌을 때만 실제로 부르고(KAN-23·24), 꺼져 있으면 목(base)을 그대로 쓴다.
// supabase-js 없이 PostgREST를 fetch로 부른다. anon 키는 공개해도 되는 키다(권한은 RLS·RPC grant가 막는다).
import { checkUploadFile } from '../upload';
import { resolveThumbnail, thumbnailForSource } from '../thumbnail';
import { createAuth } from './auth';
import { withoutEstimates } from './editable';
import { DailyLimitError, NotSignedInError } from './types';
import type { EditableIngredient, EditableRecipe, EditableStep, Folder, Job, Quota, RecipeApi, RecipeSummary, Run, TeamRecipe, UserRecipe } from './types';
import { FolderError } from './types';

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
  creator?: string | null;
  platform?: string | null;
  duration_ms?: number | null;
  thumbnail_url?: string | null;
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

// list_recipes 한 줄(20261117120000_kan73_read_apis.sql). 썸네일·폴더(category_ids)가 같이 온다.
interface RecipeListRow {
  id: string;
  run_id: string;
  title: string;
  ingredient_count: number;
  unconfirmed_count: number;
  thumbnail_url: string | null;
  category_ids: string[] | null;
  created_at: string;
}

// Storage는 정책(RLS)에 막히면 HTTP 400을 주고 실제 상태는 본문 statusCode에 넣는다(예: {"statusCode":"403"}).
// 토큰이 끝났거나 로그인하지 않은 경우라서 로그인 안내로 보낸다.
function storageDenied(status: number, text: string): boolean {
  if (status === 401 || status === 403) return true;
  try {
    return ['401', '403'].includes(String((JSON.parse(text) as { statusCode?: unknown }).statusCode));
  } catch {
    return false;
  }
}

// 업로드로 만든 결과는 원본을 지워서 열 링크가 없다(source_url은 upload:<uuid>)
const publicSource = (sourceUrl: string) => (sourceUrl.startsWith('upload:') ? '' : sourceUrl);

// 목 레시피북에 저장할 때 원본 링크를 채우려고 runId → 링크를 기억해 둔다(목은 실제 run을 모른다).
const SOURCE_KEY = 'supabase-run-sources-v1';

// list_featured 한 줄(supabase/migrations/20261117120000_kan73_read_apis.sql). 화면에 쓰는 칸만 적는다.
interface FeaturedRow {
  run_id: string;
  title: string | null;
  creator: string | null;
  ingredient_count: number | null;
  categories?: string[] | null;
  platform?: string | null;
  thumbnail_url?: string | null;
  save_count?: number | null;
}

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
      // 하루 한도(SQLSTATE PT429 → HTTP 429). 메시지가 'daily limit: anon'이면 로그인 전 전체 합계
      if (res.status === 429 || text.includes('PT429')) throw new DailyLimitError(text.includes('daily limit: anon') ? 'anon' : 'user');
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
    p_ingredients: withoutEstimates(draft).ingredients,
    p_steps: draft.steps,
  });

  const demo: RecipeApi = {
    ...base,

    // 홈 추천(S6): 운영자가 featured_runs에 넣은 결과를 position 순서대로 받는다(list_featured, #63).
    // 지금은 한 묶음 "Trending now"로 보여 준다. 비었거나 못 불러오면 빈 목록 → 홈이 칸을 숨긴다.
    // 지어낸 추천은 보여 주지 않는다(#69 선규 리뷰: 영상에 있는 것만).
    async listRecommendations() {
      const rows = await rpc<FeaturedRow[]>('list_featured', {}).catch(() => null);
      if (!rows || rows.length === 0) return [];
      return [
        {
          id: 'trending',
          title: 'Trending now',
          cards: rows.map((r) => ({
            runId: r.run_id,
            title: r.title?.trim() || 'Untitled recipe',
            creator: r.creator?.trim() || '',
            ingredientCount: r.ingredient_count ?? 0,
            categories: r.categories ?? [],
            platform: r.platform ?? null,
            thumbnailUrl: resolveThumbnail(r.thumbnail_url, apiBase),
            saveCount: r.save_count ?? 0,
          })),
        },
      ];
    },

    async createJob(sourceUrl) {
      const id = await rpc<string>('create_job', { p_source_url: sourceUrl.trim() });
      if (!id) throw new Error('create_job returned no id');
      return { jobId: id };
    },

    // 비공개 버킷 uploads에 incoming/<uuid>.<확장자>로 올린 뒤 job을 만든다. 로그인한 사람만 된다(20261109 마이그레이션).
    async createUploadJob(file) {
      const check = checkUploadFile(file);
      if (!check.ok) throw new Error(`invalid upload: ${check.reason}`);
      const path = `incoming/${crypto.randomUUID()}.${check.ext}`;
      const res = await fetchImpl(`${apiBase}/storage/v1/object/uploads/${path}`, {
        method: 'POST',
        headers: { apikey: options.anonKey, authorization: `Bearer ${await bearer(true)}`, 'content-type': check.mime, 'x-upsert': 'false' },
        body: file,
      });
      if (!res.ok) {
        const text = await res.text();
        if (storageDenied(res.status, text)) throw new NotSignedInError();
        throw new Error(`upload ${res.status}: ${text.slice(0, 200)}`);
      }
      const id = await rpc<string>('create_upload_job', { p_upload_path: path }, true);
      if (!id) throw new Error('create_upload_job returned no id');
      return { jobId: id };
    },

    async getQuota(): Promise<Quota | null> {
      if (!(await auth?.accessToken())) return null;
      try {
        const rows = await rpc<{ used: number; daily_limit: number }[]>('get_quota', {}, true);
        const row = rows?.[0];
        return row ? { used: row.used, limit: row.daily_limit } : null;
      } catch (err) {
        if (err instanceof NotSignedInError) return null;
        throw err;
      }
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
      return {
        id: row.id,
        sourceUrl,
        recipe: row.recipe,
        createdAt: row.created_at,
        creator: row.creator ?? null,
        platform: row.platform ?? null,
        durationMs: row.duration_ms ?? null,
        thumbnailUrl: resolveThumbnail(row.thumbnail_url, apiBase),
      };
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
      // 표(user_recipes)는 원본(runs)을 못 읽어서 썸네일이 없다 → RPC로 받는다
      const rows = (await rpc<RecipeListRow[]>('list_recipes', {}, true)) ?? [];
      return rows.map((row) => ({
        id: row.id,
        runId: row.run_id,
        title: row.title,
        ingredientCount: row.ingredient_count,
        unconfirmedCount: row.unconfirmed_count,
        thumbnailUrl: resolveThumbnail(row.thumbnail_url, apiBase),
        categoryIds: row.category_ids ?? [],
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
        // 업로드는 링크를 숨기지만 저장한 프레임은 보여 준다 → 원래 값(upload:<id>)으로 만든다
        thumbnailUrl: thumbnailForSource(row.source_url, apiBase),
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

    // 폴더 = DB categories (list_categories·create_category·set_recipe_categories, 20261117130000)
    async listFolders() {
      const rows = (await rpc<FolderRow[]>('list_categories', {}, true)) ?? [];
      return rows.map(toFolder);
    },

    async createFolder(name, emoji = null) {
      try {
        const row = (await rpc<FolderRow[]>('create_category', { p_name: name, p_emoji: emoji }, true))?.[0];
        if (!row) throw new Error('create_category returned nothing');
        return toFolder(row);
      } catch (err) {
        const text = String((err as Error)?.message ?? '');
        if (text.includes('23505')) throw new FolderError('duplicate');
        if (text.includes('too many categories')) throw new FolderError('too_many');
        if (text.includes('22023')) throw new FolderError('invalid');
        throw err;
      }
    },

    async setRecipeFolders(recipeId, folderIds) {
      await rpc<null>('set_recipe_categories', { p_recipe_id: recipeId, p_category_ids: folderIds }, true);
    },
  };
}

interface FolderRow {
  id: string;
  name: string;
  emoji: string | null;
  recipe_count: number;
}

const toFolder = (row: FolderRow): Folder => ({ id: row.id, name: row.name, emoji: row.emoji, recipeCount: row.recipe_count ?? 0 });

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
