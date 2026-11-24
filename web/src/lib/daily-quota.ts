// 하루 변환 한도(docs/screen-data.md 3절 7번). 서버(create_job)가 로그인 10개·로그인 전 전체 50개를 막고,
// 로그인 전 브라우저당 3개는 여기서 센다. 브라우저 저장소를 지우면 다시 셀 수 있지만 전체 50개는 서버가 막는다.
// "하루"는 서버와 같이 한국 시간 0시에 바뀐다.
export const USER_DAILY_LIMIT = 10;
export const BROWSER_DAILY_LIMIT = 3;

const KEY = 'daily-jobs-v1';
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000; // 한국은 서머타임이 없다

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** 한국 시간 날짜(YYYY-MM-DD) */
export function seoulDay(ms: number): string {
  return new Date(ms + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read(storage: Storage | null): { day: string; count: number } | null {
  try {
    const data: unknown = JSON.parse(storage?.getItem(KEY) ?? 'null');
    const d = data as { day?: unknown; count?: unknown } | null;
    return typeof d?.day === 'string' && typeof d?.count === 'number' ? { day: d.day, count: d.count } : null;
  } catch {
    return null;
  }
}

/** 이 브라우저에서 오늘 만든 작업 수 */
export function browserUsedToday(now = Date.now(), storage: Storage | null = browserStorage()): number {
  const saved = read(storage);
  return saved?.day === seoulDay(now) ? saved.count : 0;
}

/** 작업을 만들 때마다 부른다(로그인 여부와 관계없이 센다. 한도는 로그인 전에만 본다) */
export function countBrowserJob(now = Date.now(), storage: Storage | null = browserStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ day: seoulDay(now), count: browserUsedToday(now, storage) + 1 }));
  } catch {
    // 시크릿 창 등에서 막히면 브라우저 한도만 안 센다. 서버 한도는 그대로다
  }
}
