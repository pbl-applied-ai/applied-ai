import { describe, expect, it } from "vitest";
import { MOCK_LINKS, createMockApi } from "./mock";

// 시간과 저장소를 바깥에서 넣어서 진행 단계와 새로고침을 확인한다.
function setup() {
  let now = Date.parse("2026-10-26T00:00:00Z");
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  const make = () => createMockApi({ now: () => now, latencyMs: 0, storage });
  return { api: make(), make, later: (ms: number) => (now += ms) };
}

describe("createMockApi", () => {
  it("시간에 따라 queued → collect → structure → succeeded", async () => {
    const { api, later } = setup();
    const { jobId } = await api.createJob(MOCK_LINKS.success);
    expect((await api.getJob(jobId))?.status).toBe("queued");
    later(1000);
    expect((await api.getJob(jobId))?.stage).toBe("collect");
    later(2000);
    expect((await api.getJob(jobId))?.stage).toBe("structure");
    later(3000);
    const done = await api.getJob(jobId);
    expect(done?.status).toBe("succeeded");
    expect(done?.runId).toBe("run-Smpl0Gochu1");
  });

  it("실패 링크는 errorCode·reason으로 끝나고, partial_recipe만 runId가 있다", async () => {
    const { api, later } = setup();
    const notRecipe = await api.createJob(MOCK_LINKS.notARecipe);
    const partial = await api.createJob(MOCK_LINKS.partialRecipe);
    later(6000);
    expect(await api.getJob(notRecipe.jobId)).toMatchObject({ status: "failed", errorCode: "not_a_recipe", runId: null });
    expect(await api.getJob(partial.jobId)).toMatchObject({
      status: "failed",
      errorCode: "insufficient",
      reason: "partial_recipe",
      runId: "run-MockPartl01",
    });
  });

  it("저장소에 남아 있어서 새로고침(새 인스턴스)해도 같은 결과", async () => {
    const { api, make, later } = setup();
    const { jobId } = await api.createJob(MOCK_LINKS.retryable);
    later(6000);
    expect(await make().getJob(jobId)).toMatchObject({ status: "failed", errorCode: "retryable" });
  });

  it("없는 job은 null", async () => {
    const { api } = setup();
    expect(await api.getJob("missing")).toBeNull();
  });
});
