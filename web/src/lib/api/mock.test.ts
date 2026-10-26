import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi } from "./mock";

afterEach(() => vi.useRealTimers());

async function jobAfter(url: string, ms: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
  const { id } = await mockApi.createJob(url);
  vi.setSystemTime(Date.now() + ms);
  return mockApi.getJob(id);
}

describe("mockApi", () => {
  it("시간에 따라 queued → collect → structure → succeeded", async () => {
    const url = "https://www.youtube.com/shorts/AbCdEfGhIj0";
    expect((await jobAfter(url, 100)).status).toBe("queued");
    expect((await jobAfter(url, 1000)).stage).toBe("collect");
    expect((await jobAfter(url, 4000)).stage).toBe("structure");
    const done = await jobAfter(url, 7000);
    expect(done.status).toBe("succeeded");
    expect(done.run_id).toBe("example-002-pipeline-output");
  });

  it("실패용 영상 ID는 error_code로 끝난다", async () => {
    const job = await jobAfter("https://www.youtube.com/shorts/NOTARECIPE0", 3000);
    expect(job.status).toBe("failed");
    expect(job.error_code).toBe("not_a_recipe");
  });

  it("id만으로 상태를 다시 계산해서 새로고침해도 결과가 같다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
    const { id } = await mockApi.createJob("https://www.youtube.com/shorts/RETRYABLE00");
    vi.setSystemTime(Date.now() + 9000);
    // 새 모듈 상태 없이 id만으로 조회
    const job = await mockApi.getJob(id);
    expect(job.status).toBe("failed");
    expect(job.error_code).toBe("retryable");
  });
});
