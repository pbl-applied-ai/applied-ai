// 선규 API(Supabase)가 붙기 전까지 화면을 만들기 위한 목.
// 브라우저 localStorage에 저장하므로 클라이언트 컴포넌트('use client')에서만 부른다.
//
// 링크에 따라 결과가 달라진다(MOCK_LINKS: 실패 안내 7종 + 지원 안 하는 링크). 그 밖의 YouTube 링크는 모두 성공하고 SAMPLE_RECIPE를 돌려준다.
// 시간 흐름: 대기 0.8초 → collect → structure → 끝(약 5초).
import { PARTIAL_RECIPE, SAMPLE_RECIPE } from './fixtures';
import { toSummary } from './editable';
import { checkShortsUrl } from '../shorts';
import {
  NotSignedInError,
  type EditableRecipe,
  type Job,
  type JobErrorCode,
  type JobStage,
  type RecipeApi,
  type Run,
  type TeamRecipe,
  type User,
  type UserRecipe,
} from './types';

export const MOCK_LINKS = {
  success: 'https://www.youtube.com/shorts/Smpl0Gochu1',
  retryable: 'https://www.youtube.com/shorts/MockFlaky01',
  notPlayable: 'https://www.youtube.com/shorts/MockPrivat1', // 비공개·삭제
  noCaptions: 'https://www.youtube.com/shorts/MockNoCap01',
  notARecipe: 'https://www.youtube.com/shorts/MockNotRcp1',
  partialRecipe: 'https://www.youtube.com/shorts/MockPartl01', // 조리 순서 없음 → 찾은 만큼 보기
  emptyRecipe: 'https://www.youtube.com/shorts/MockEmpty01',
  internal: 'https://www.youtube.com/shorts/MockIntrn01',
  unsupported: 'https://www.instagram.com/reel/mock', // YouTube가 아님
} as const;

// error_code·reason은 docs/worker-interface.md 6번 표의 값
interface MockFailure {
  code: JobErrorCode;
  reason: string;
  stage: JobStage;
}

const FAILURES: Record<string, MockFailure> = {
  MockFlaky01: { code: 'retryable', reason: 'llm_transient', stage: 'structure' },
  MockPrivat1: { code: 'unavailable', reason: 'not_playable', stage: 'collect' },
  MockNoCap01: { code: 'unavailable', reason: 'no_captions_no_description', stage: 'collect' },
  MockNotRcp1: { code: 'not_a_recipe', reason: 'model_not_a_recipe', stage: 'finalize' },
  MockPartl01: { code: 'insufficient', reason: 'partial_recipe', stage: 'finalize' },
  MockEmpty01: { code: 'insufficient', reason: 'empty_recipe', stage: 'finalize' },
  MockIntrn01: { code: 'internal', reason: 'unexpected', stage: 'structure' },
};
const UNSUPPORTED: MockFailure = { code: 'unsupported_source', reason: 'not_youtube', stage: 'collect' };

const T_COLLECT = 800;
const T_STRUCTURE = 2500;
const T_DONE = 5000;

interface StoredJob {
  id: string;
  sourceUrl: string;
  videoId: string | null;
  requestedBy: string | null;
  createdAt: number;
}

interface State {
  user: User | null;
  jobs: Record<string, StoredJob>;
  recipes: Record<string, UserRecipe>;
}

export interface MockOptions {
  now?: () => number;
  latencyMs?: number; // 로딩 상태를 보기 위한 가짜 지연
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  navigate?: (url: string) => void; // signInWithGoogle 뒤 이동. 기본은 location.assign
}

const STORAGE_KEY = 'mock-api-v1';

export function createMockApi(options: MockOptions = {}): RecipeApi {
  const now = options.now ?? Date.now;
  const latency = options.latencyMs ?? 200;
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const navigate = options.navigate ?? ((url: string) => globalThis.location?.assign(url));
  let memory: State = { user: null, jobs: {}, recipes: {} };

  function load(): State {
    if (!storage) return memory;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as State) : memory;
    } catch {
      return memory;
    }
  }
  function save(state: State): void {
    memory = state;
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 저장소가 막혀도 메모리로 동작한다
    }
  }
  const wait = () => new Promise((resolve) => setTimeout(resolve, latency));
  const iso = (ms: number) => new Date(ms).toISOString();

  function runFor(videoId: string, sourceUrl: string): Run {
    const base = FAILURES[videoId]?.reason === 'partial_recipe' ? PARTIAL_RECIPE : SAMPLE_RECIPE;
    const recipe: TeamRecipe = { ...base, video_id: videoId };
    return { id: `run-${videoId}`, sourceUrl, recipe, createdAt: iso(0) };
  }

  function view(job: StoredJob): Job {
    const elapsed = now() - job.createdAt;
    const failure = job.videoId ? FAILURES[job.videoId] : UNSUPPORTED;
    const base = { id: job.id, sourceUrl: job.sourceUrl, createdAt: iso(job.createdAt), errorCode: null, reason: null, runId: null };

    if (elapsed < T_COLLECT) return { ...base, status: 'queued', stage: null };
    const failAt = failure?.stage === 'collect' ? T_STRUCTURE : T_DONE;
    if (failure && elapsed >= failAt) {
      // partial_recipe는 찾은 만큼의 결과를 run으로 준다(찾은 만큼 보기)
      const runId = failure.reason === 'partial_recipe' ? `run-${job.videoId}` : null;
      return { ...base, status: 'failed', stage: failure.stage, errorCode: failure.code, reason: failure.reason, runId };
    }
    if (elapsed < T_STRUCTURE) return { ...base, status: 'running', stage: 'collect' };
    if (elapsed < T_DONE) return { ...base, status: 'running', stage: 'structure' };
    return { ...base, status: 'succeeded', stage: 'finalize', runId: `run-${job.videoId}` };
  }

  function requireUser(state: State): User {
    if (!state.user) throw new NotSignedInError();
    return state.user;
  }

  return {
    async createJob(sourceUrl) {
      await wait();
      if (!/^https?:\/\//i.test(sourceUrl.trim())) throw new Error('invalid source_url');
      const state = load();
      const check = checkShortsUrl(sourceUrl); // MVP는 Shorts만. 그 밖의 링크는 unsupported_source
      const job: StoredJob = {
        id: crypto.randomUUID(),
        sourceUrl: sourceUrl.trim(),
        videoId: check.ok ? check.videoId : null,
        requestedBy: state.user?.id ?? null,
        createdAt: now(),
      };
      save({ ...state, jobs: { ...state.jobs, [job.id]: job } });
      return { jobId: job.id };
    },

    async getJob(jobId) {
      await wait();
      const job = load().jobs[jobId];
      return job ? { ...view(job), sourceUrl: '' } : null; // get_job RPC처럼 링크는 주지 않는다
    },

    async getRun(runId) {
      await wait();
      const videoId = runId.startsWith('run-') ? runId.slice(4) : '';
      if (!videoId || (FAILURES[videoId] && FAILURES[videoId].reason !== 'partial_recipe')) return null;
      const job = Object.values(load().jobs).find((j) => j.videoId === videoId);
      return runFor(videoId, job?.sourceUrl ?? `https://www.youtube.com/shorts/${videoId}`);
    },

    async getUser() {
      await wait();
      return load().user;
    },

    async signInWithGoogle(returnTo) {
      await wait();
      save({ ...load(), user: { id: 'mock-user', email: 'tester@example.com' } });
      navigate(returnTo); // 실제 구글 로그인처럼 페이지를 다시 연다
    },

    async signOut() {
      await wait();
      save({ ...load(), user: null });
    },

    async listMyJobs() {
      await wait();
      const state = load();
      const user = requireUser(state);
      return Object.values(state.jobs)
        .filter((job) => job.requestedBy === user.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(view);
    },

    async saveRecipe(draft) {
      await wait();
      const state = load();
      requireUser(state);
      const existing = Object.values(state.recipes).find((r) => r.runId === draft.runId);
      const at = iso(now());
      const recipe: UserRecipe = {
        ...draft,
        id: existing?.id ?? crypto.randomUUID(),
        sourceUrl: Object.values(state.jobs).find((j) => `run-${j.videoId}` === draft.runId)?.sourceUrl ?? '',
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
      };
      save({ ...state, recipes: { ...state.recipes, [recipe.id]: recipe } });
      return { id: recipe.id };
    },

    async listRecipes() {
      await wait();
      const state = load();
      requireUser(state);
      return Object.values(state.recipes)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(toSummary);
    },

    async getRecipe(id) {
      await wait();
      const state = load();
      requireUser(state);
      return state.recipes[id] ?? null;
    },

    async updateRecipe(id, draft: EditableRecipe) {
      await wait();
      const state = load();
      requireUser(state);
      const current = state.recipes[id];
      if (!current) throw new Error('recipe not found');
      const next: UserRecipe = { ...current, ...draft, id, updatedAt: iso(now()) };
      save({ ...state, recipes: { ...state.recipes, [id]: next } });
    },

    async deleteRecipe(id) {
      await wait();
      const state = load();
      requireUser(state);
      const recipes = { ...state.recipes };
      delete recipes[id];
      save({ ...state, recipes });
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
