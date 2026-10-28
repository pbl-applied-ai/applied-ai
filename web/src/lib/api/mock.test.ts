import { describe, expect, it } from "vitest";
import { MOCK_LINKS, createMockApi } from "./mock";

function setup() {
  let t = Date.parse("2026-10-26T00:00:00Z");
  const api = createMockApi({ now: () => t, latencyMs: 0, storage: null, navigate: () => {} });
  return { api, advance: (ms: number) => (t += ms) };
}

describe("createMockApi", () => {
  it("시간에 따라 queued → collect → structure → succeeded", async () => {
    const { api, advance } = setup();
    const { jobId } = await api.createJob(MOCK_LINKS.success);
    expect((await api.getJob(jobId))?.status).toBe("queued");
    advance(1000);
    expect((await api.getJob(jobId))?.stage).toBe("collect");
    advance(2000);
    expect((await api.getJob(jobId))?.stage).toBe("structure");
    advance(3000);
    const done = await api.getJob(jobId);
    expect(done?.status).toBe("succeeded");
    expect(done?.runId).toBeTruthy();
    expect(await api.getRun(done!.runId!)).not.toBeNull();
  });

  it("실패용 링크는 error_code·reason으로 끝나고, partial_recipe만 결과를 준다", async () => {
    const { api, advance } = setup();
    const notRecipe = await api.createJob(MOCK_LINKS.notARecipe);
    const partial = await api.createJob(MOCK_LINKS.partialRecipe);
    advance(6000);
    const a = await api.getJob(notRecipe.jobId);
    expect([a?.status, a?.errorCode, a?.runId]).toEqual(["failed", "not_a_recipe", null]);
    const b = await api.getJob(partial.jobId);
    expect([b?.status, b?.errorCode, b?.reason]).toEqual(["failed", "insufficient", "partial_recipe"]);
    expect(b?.runId).toBeTruthy();
  });

  it("Shorts가 아닌 YouTube 링크는 unsupported_source", async () => {
    const { api, advance } = setup();
    const { jobId } = await api.createJob("https://www.youtube.com/watch?v=AbCdEfGhIj0");
    advance(6000);
    expect((await api.getJob(jobId))?.errorCode).toBe("unsupported_source");
  });

  it("없는 job은 null", async () => {
    const { api } = setup();
    expect(await api.getJob("nope")).toBeNull();
  });
});
