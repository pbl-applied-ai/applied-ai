// 레시피북 "만드는 중" 카드에서 다시 보이지 않게 할 것들.
// - 저장하거나 지운 결과(runId)와 그 시각: 레시피를 지운 뒤에도 "준비됐어요"·실패 카드로 되살아나지 않게 한다.
//   그 시각보다 뒤에 만든 작업은 숨기지 않는다(같은 영상을 다시 넣으면 캐시로 같은 runId가 나올 수 있어서).
// - 사용자가 [닫기]로 치운 실패 작업(jobId)
// 서버에는 이 정보가 없어서 이 브라우저에만, 사용자별로 남긴다. 실제 API에서 jobs에 숨김 표시를 두면 대신할 수 있다.
const KEY = 'book-hidden-v1';
const MAX_ITEMS = 200; // 오래된 것부터 버린다

export interface BookHidden {
  runs: Map<string, number>; // runId → 저장·삭제한 시각(ms)
  jobs: Set<string>;
}

type Stored = { runs: Record<string, number>; jobs: string[] };

const keyFor = (userId: string) => `${KEY}:${userId}`;

function read(userId: string): Stored {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    const data = raw ? (JSON.parse(raw) as Partial<Stored>) : {};
    const runs = data.runs && typeof data.runs === 'object' && !Array.isArray(data.runs) ? data.runs : {};
    return { runs, jobs: Array.isArray(data.jobs) ? data.jobs : [] };
  } catch {
    return { runs: {}, jobs: [] };
  }
}

function write(userId: string, update: (data: Stored) => Stored): void {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(update(read(userId))));
  } catch {
    // 시크릿 창 등에서 막히면 카드가 다시 보일 뿐 화면은 그대로 동작한다
  }
}

export function readBookHidden(userId: string): BookHidden {
  const data = read(userId);
  return { runs: new Map(Object.entries(data.runs)), jobs: new Set(data.jobs) };
}

/** 레시피를 저장하거나 지울 때 부른다 */
export function rememberSavedRun(userId: string, runId: string, now = Date.now()): void {
  write(userId, (data) => {
    const entries = Object.entries({ ...data.runs, [runId]: now }).sort((a, b) => a[1] - b[1]);
    return { ...data, runs: Object.fromEntries(entries.slice(-MAX_ITEMS)) };
  });
}

/** 실패 카드의 [닫기] */
export function hideJob(userId: string, jobId: string): void {
  write(userId, (data) => (data.jobs.includes(jobId) ? data : { ...data, jobs: [...data.jobs, jobId].slice(-MAX_ITEMS) }));
}
