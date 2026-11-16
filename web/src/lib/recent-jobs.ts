// 이 브라우저에서 만든 작업 ID를 최근 몇 개 기억한다(docs/ux-flow.md S6).
// 로그인 전에 링크를 넣고 처리 중 화면을 떠난 사람이 홈의 "만드는 중" 카드로 돌아오게 하려고 쓴다.
// 로그인했으면 서버의 내 작업(listMyJobs)을 쓰므로 이 목록은 보지 않는다.
// 탭을 닫아도 남도록 localStorage에 둔다(링크를 기억하는 job-source는 탭 안에서만 쓴다).
const KEY = 'recent-jobs-v1';
export const MAX_RECENT_JOBS = 5;
export const RECENT_JOB_TTL_MS = 24 * 60 * 60 * 1000; // 하루 지난 작업은 카드로 띄우지 않는다

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

interface Entry {
  id: string;
  at: number; // 기억한 시각(ms)
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read(storage: Storage | null): Entry[] {
  try {
    const raw = storage?.getItem(KEY);
    const data: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return data.filter((e): e is Entry => typeof e?.id === 'string' && typeof e?.at === 'number');
  } catch {
    return [];
  }
}

/** 작업을 만들 때 부른다. 같은 ID는 맨 앞으로 옮기고, 오래된 것부터 버린다. */
export function rememberRecentJob(jobId: string, now = Date.now(), storage: Storage | null = browserStorage()): void {
  const next = [{ id: jobId, at: now }, ...read(storage).filter((e) => e.id !== jobId)].slice(0, MAX_RECENT_JOBS);
  try {
    storage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // 시크릿 창 등에서 막히면 홈 카드만 안 보인다. 처리 중 화면은 그대로 동작한다
  }
}

/** 최근 것부터. 하루 지난 작업은 뺀다. */
export function recentJobIds(now = Date.now(), storage: Storage | null = browserStorage()): string[] {
  return read(storage)
    .filter((e) => now - e.at < RECENT_JOB_TTL_MS)
    .sort((a, b) => b.at - a.at)
    .map((e) => e.id);
}
