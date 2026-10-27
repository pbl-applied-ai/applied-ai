// S3 처리 중 화면의 문구 규칙. 단계 문구는 PR #14(worker-interface), 실패 안내는 docs/ux-flow.md S3를 따른다.
import type { Job, JobErrorCode, JobStage } from "@/lib/api";

const STAGE_TEXT: Record<JobStage, string> = {
  collect: "영상 정보 가져오는 중…",
  asr: "음성 듣는 중…",
  ocr: "화면 글자 읽는 중…",
  structure: "레시피 정리 중…",
  finalize: "레시피 정리 중…",
};

export function stageText(job: Pick<Job, "status" | "stage">): string {
  if (job.status === "queued" || job.stage === null) return "곧 시작해요…";
  // 응답은 런타임 값이라 타입에 없는 단계가 올 수 있다.
  return STAGE_TEXT[job.stage] ?? "곧 시작해요…";
}

export type FailureAction = "retry" | "other_link" | "partial";

export interface FailureCopy {
  title: string;
  body: string;
  actions: FailureAction[];
}

const FAILURE: Record<JobErrorCode, FailureCopy> = {
  retryable: {
    title: "잠시 문제가 생겼어요",
    body: "몇 번 다시 시도했지만 실패했어요.\n조금 뒤에 다시 시도해 주세요.",
    actions: ["retry", "other_link"],
  },
  unavailable: {
    title: "이 영상은 열 수 없어요",
    body: "비공개이거나 삭제된 영상일 수 있어요.\n다른 영상 링크를 넣어 주세요.",
    actions: ["other_link"],
  },
  unsupported_source: {
    title: "지원하지 않는 영상이에요",
    body: "지금은 YouTube Shorts만 레시피로 만들 수 있어요.",
    actions: ["other_link"],
  },
  not_a_recipe: {
    title: "요리 영상이 아닌 것 같아요",
    body: "레시피가 담긴 요리 Shorts 링크를\n넣어 주세요.",
    actions: ["other_link"],
  },
  insufficient: {
    title: "영상에서 찾은 정보가 적어요",
    body: "찾은 내용만 보여 드릴게요.\n빠진 부분은 직접 채울 수 있어요.",
    actions: ["partial", "other_link"],
  },
  internal: {
    title: "잠시 문제가 생겼어요",
    body: "레시피를 정리하다가 문제가 생겼어요.\n다시 시도해 주세요.",
    actions: ["retry", "other_link"],
  },
};

const UNKNOWN: FailureCopy = FAILURE.retryable;

/** 실패한 job의 안내. insufficient인데 결과(runId)가 없으면 '찾은 만큼 보기'를 뺀다. */
export function failureCopy(job: Pick<Job, "errorCode" | "runId">): FailureCopy {
  // 워커가 새 error_code를 보내도 화면이 깨지지 않게 모르는 코드는 일시 오류로 안내한다.
  const copy = (job.errorCode && FAILURE[job.errorCode]) || UNKNOWN;
  if (job.errorCode === "insufficient" && !job.runId) {
    return {
      title: "영상에서 레시피를 찾지 못했어요",
      body: "재료와 조리 순서를 찾지 못했어요.\n다른 영상으로 다시 해 보세요.",
      actions: ["other_link"],
    };
  }
  return copy;
}
