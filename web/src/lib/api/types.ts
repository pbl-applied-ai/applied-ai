// jobs 계약 초안. 필드 이름은 docs/dev-plan.md(jobs 표)와 PR #14(worker-interface)를 따른다.
// 선규의 jobs API(KAN-22)가 확정되면 이 파일을 먼저 맞춘다.

export type JobStatus = "queued" | "processing" | "succeeded" | "failed";
export type JobStage = "collect" | "asr" | "ocr" | "structure";
export type JobErrorCode =
  | "retryable"
  | "unavailable"
  | "unsupported_source"
  | "not_a_recipe"
  | "insufficient"
  | "schema_error";

export interface Job {
  id: string;
  status: JobStatus;
  stage: JobStage | null;
  error_code: JobErrorCode | null;
  run_id: string | null;
}

export interface ApiClient {
  createJob(sourceUrl: string): Promise<{ id: string }>;
  getJob(id: string): Promise<Job>;
}
