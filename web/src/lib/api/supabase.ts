// 데모용 최소 연결: 로그인 없이 쓰는 3개(createJob·getJob·getRun)만 실제 Supabase RPC로 부르고,
// 로그인·저장·레시피북은 목(base)을 그대로 쓴다. 나머지는 KAN-22~24에서 Supabase로 옮긴다.
// supabase-js 없이 PostgREST RPC를 fetch로 부른다. anon 키는 공개해도 되는 키다(권한은 RLS·RPC grant가 막는다).
import type { Job, RecipeApi, Run, TeamRecipe, UserRecipe } from './types';

export interface SupabaseOptions {
  url: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
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

// 목 레시피북에 저장할 때 원본 링크를 채우려고 runId → 링크를 기억해 둔다(목은 실제 run을 모른다).
const SOURCE_KEY = 'supabase-run-sources-v1';

export function createSupabaseApi(base: RecipeApi, options: SupabaseOptions): RecipeApi {
  const endpoint = `${options.url.replace(/\/$/, '')}/rest/v1/rpc`;
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const storage = options.storage === undefined ? browserStorage() : options.storage;

  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
    const res = await fetchImpl(`${endpoint}/${name}`, {
      method: 'POST',
      headers: { apikey: options.anonKey, authorization: `Bearer ${options.anonKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    if (!res.ok) {
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

  return {
    ...base,

    async createJob(sourceUrl) {
      const id = await rpc<string>('create_job', { p_source_url: sourceUrl.trim() });
      if (!id) throw new Error('create_job returned no id');
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
      rememberSource(row.id, row.source_url);
      return { id: row.id, sourceUrl: row.source_url, recipe: row.recipe, createdAt: row.created_at };
    },

    async getRecipe(id) {
      const recipe = await base.getRecipe(id);
      return recipe ? withSource(recipe) : null;
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
