// API가 나오기 전에 화면을 만들기 위한 가짜 jobs. 만든 시각으로부터 지난 시간에 따라 단계가 바뀐다.
// id에 만든 시각과 영상 ID를 넣어 두어서(mock-<시각36진수>-<영상ID>) 새로고침해도 같은 결과가 나온다.
// 아래 영상 ID로 Shorts 링크를 넣으면 실패 화면을 볼 수 있다(예: youtube.com/shorts/NOTARECIPE0).
import type { ApiClient, Job, JobErrorCode } from "./types";

// #13 샘플 폴더 이름(examples/example-002-pipeline-output)과 맞춘다.
const SAMPLE_RUN_ID = "example-002-pipeline-output";

export const MOCK_FAIL_IDS: Record<string, { code: JobErrorCode; runId: string | null }> = {
  RETRYABLE00: { code: "retryable", runId: null },
  UNAVAILABLE: { code: "unavailable", runId: null },
  NOTARECIPE0: { code: "not_a_recipe", runId: null },
  INSUFFICIEN: { code: "insufficient", runId: SAMPLE_RUN_ID },
  EMPTYRECIPE: { code: "insufficient", runId: null },
};

function videoIdOf(sourceUrl: string): string {
  return sourceUrl.split("/shorts/")[1]?.split(/[?/#]/)[0] ?? "";
}

function parseMockId(id: string): { createdAt: number; videoId: string } {
  const [, time, ...rest] = id.split("-");
  const createdAt = parseInt(time ?? "", 36);
  return { createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(), videoId: rest.join("-") };
}

export const mockApi: ApiClient = {
  async createJob(sourceUrl) {
    return { id: `mock-${Date.now().toString(36)}-${videoIdOf(sourceUrl)}` };
  },

  async getJob(id) {
    const { createdAt, videoId } = parseMockId(id);
    const elapsed = Date.now() - createdAt;
    const base: Job = { id, status: "queued", stage: null, error_code: null, run_id: null };
    if (elapsed < 800) return base;

    const fail = MOCK_FAIL_IDS[videoId];
    if (fail && elapsed > 2500) return { ...base, status: "failed", stage: "collect", error_code: fail.code, run_id: fail.runId };
    if (elapsed > 6000) return { ...base, status: "succeeded", stage: null, run_id: SAMPLE_RUN_ID };
    if (elapsed > 3000) return { ...base, status: "processing", stage: "structure" };
    return { ...base, status: "processing", stage: "collect" };
  },
};
