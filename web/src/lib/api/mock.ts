// API가 나오기 전에 화면을 만들기 위한 가짜 jobs. 만든 시각으로부터 지난 시간에 따라 단계가 바뀐다.
import type { ApiClient, Job } from "./types";

const created = new Map<string, number>();
let seq = 0;

export const mockApi: ApiClient = {
  async createJob() {
    seq += 1;
    const id = `mock-${Date.now().toString(36)}-${seq}`;
    created.set(id, Date.now());
    return { id };
  },

  async getJob(id) {
    const elapsed = Date.now() - (created.get(id) ?? Date.now());
    const job: Job = { id, status: "processing", stage: "collect", error_code: null, run_id: null };
    if (elapsed > 6000) return { ...job, status: "succeeded", stage: null, run_id: "example-002" };
    if (elapsed > 2500) return { ...job, stage: "structure" };
    return job;
  },
};
