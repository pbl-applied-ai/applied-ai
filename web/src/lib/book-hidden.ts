// 레시피북 "만드는 중" 카드에서 다시 보이지 않게 할 것들.
// - 저장한 적 있는 결과(runId): 레시피를 지운 뒤에도 "준비됐어요"·실패 카드로 되살아나지 않게 한다
// - 사용자가 [닫기]로 치운 실패 작업(jobId)
// 서버에는 이 정보가 없어서 이 브라우저에만 남긴다. 실제 API에서 jobs에 숨김 표시를 두면 대신할 수 있다.
const KEY = 'book-hidden-v1';
const MAX_ITEMS = 200; // 오래된 것부터 버린다

export interface BookHidden {
  runs: Set<string>;
  jobs: Set<string>;
}

type Stored = { runs: string[]; jobs: string[] };

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as Partial<Stored>) : {};
    return { runs: Array.isArray(data.runs) ? data.runs : [], jobs: Array.isArray(data.jobs) ? data.jobs : [] };
  } catch {
    return { runs: [], jobs: [] };
  }
}

function add(field: keyof Stored, value: string): void {
  try {
    const data = read();
    if (data[field].includes(value)) return;
    data[field] = [...data[field], value].slice(-MAX_ITEMS);
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 시크릿 창 등에서 막히면 카드가 다시 보일 뿐 화면은 그대로 동작한다
  }
}

export function readBookHidden(): BookHidden {
  const data = read();
  return { runs: new Set(data.runs), jobs: new Set(data.jobs) };
}

/** 레시피를 저장하거나 지울 때 부른다 */
export function rememberSavedRun(runId: string): void {
  add('runs', runId);
}

/** 실패 카드의 [닫기] */
export function hideJob(jobId: string): void {
  add('jobs', jobId);
}
