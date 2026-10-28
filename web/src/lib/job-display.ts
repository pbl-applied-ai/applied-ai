// S3 처리 중 화면이 쓰는 표시 규칙. 문구 자체는 @/lib/api의 labels(STAGE_LABEL·failGuide)에 있고,
// 여기서는 화면 상황(로그인·업로드 지원·다시 시도 가능)에 맞게 고르기만 한다.
import { type ErrorGuide, type FailAction, type Job, STAGE_LABEL, failGuide } from "@/lib/api";

const WAITING = "곧 시작해요…";

/** 지금 단계 한 줄. finalize처럼 표시하지 않는 단계는 바로 앞 단계(정리 중) 문구를 쓴다. */
export function stageText(job: Pick<Job, "status" | "stage">): string {
  if (job.status === "queued" || job.stage === null) return WAITING;
  if (job.stage === "finalize") return `${STAGE_LABEL.structure}…`;
  const label = STAGE_LABEL[job.stage];
  return label ? `${label}…` : WAITING;
}

export interface ScreenContext {
  loggedIn: boolean;
  canRetry: boolean; // 다시 시도할 링크를 기억하고 있는지
  uploadReady: boolean; // 영상 파일 업로드 경로가 있는지
}

/** 실패 안내와 지금 보여 줄 버튼. 쓸 수 없는 버튼(업로드 전, 비로그인 레시피북, 링크 모름)은 뺀다. */
export function failureView(job: Pick<Job, "errorCode" | "reason" | "runId">, ctx: ScreenContext) {
  // partial_recipe인데 찾은 결과(runId)가 없으면 보여 줄 게 없으니 "레시피를 찾지 못했어요"로 안내한다
  const noPartial = job.reason === "partial_recipe" && !job.runId;
  const guide: ErrorGuide = failGuide(noPartial ? { ...job, reason: "empty_recipe" } : job);
  const actions = guide.actions.filter((a: FailAction) => {
    if (a === "retry") return ctx.canRetry;
    if (a === "upload") return ctx.uploadReady;
    if (a === "go_book") return ctx.loggedIn;
    if (a === "show_partial") return Boolean(job.runId);
    return true;
  });
  // 다른 출구(레시피북·업로드)를 뺐으면 막다른 화면이 되지 않게 [다른 링크 넣기]를 붙인다
  const exitRemoved = guide.actions.some((a) => (a === "go_book" || a === "upload") && !actions.includes(a));
  if ((exitRemoved || actions.length === 0) && !actions.includes("other_link")) actions.push("other_link");
  return { title: guide.title, body: guide.body ?? "", actions };
}
