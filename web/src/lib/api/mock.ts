// API가 나오기 전에 화면을 만들기 위한 가짜 jobs. 만든 시각으로부터 지난 시간에 따라 단계가 바뀐다.
// 아래 영상 ID로 Shorts 링크를 넣으면 실패 화면을 볼 수 있다(예: youtube.com/shorts/NOTARECIPE0).
import type { ApiClient, Job, JobErrorCode } from "./types";

export const MOCK_FAIL_IDS: Record<string, { code: JobErrorCode; runId: string | null }> = {
  RETRYABLE00: { code: "retryable", runId: null },
  UNAVAILABLE: { code: "unavailable", runId: null },
  NOTARECIPE0: { code: "not_a_recipe", runId: null },
  INSUFFICIEN: { code: "insufficient", runId: "example-002" },
  EMPTYRECIPE: { code: "insufficient", runId: null },
};

const jobs = new Map<string, { createdAt: number; videoId: string }>();
let seq = 0;

function videoIdOf(sourceUrl: string): string {
  return sourceUrl.split("/shorts/")[1]?.split(/[?/#]/)[0] ?? "";
}

export const mockApi: ApiClient = {
  async createJob(sourceUrl) {
    seq += 1;
    const id = `mock-${Date.now().toString(36)}-${seq}`;
    jobs.set(id, { createdAt: Date.now(), videoId: videoIdOf(sourceUrl) });
    return { id };
  },

  async getJob(id) {
    const entry = jobs.get(id) ?? { createdAt: Date.now(), videoId: "" };
    if (!jobs.has(id)) jobs.set(id, entry);
    const elapsed = Date.now() - entry.createdAt;
    const base: Job = { id, status: "queued", stage: null, error_code: null, run_id: null };
    if (elapsed < 800) return base;

    const fail = MOCK_FAIL_IDS[entry.videoId];
    if (fail && elapsed > 2500) return { ...base, status: "failed", stage: "collect", error_code: fail.code, run_id: fail.runId };
    if (elapsed > 6000) return { ...base, status: "succeeded", stage: null, run_id: "example-002" };
    if (elapsed > 3000) return { ...base, status: "processing", stage: "structure" };
    return { ...base, status: "processing", stage: "collect" };
  },
};
