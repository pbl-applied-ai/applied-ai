import { describe, expect, it } from "vitest";
import type { Job, RecipeSummary } from "@/lib/api";
import { jobCards, shortDate } from "./book";

const job = (over: Partial<Job>): Job => ({
  id: "j1",
  sourceUrl: "",
  status: "running",
  stage: "collect",
  errorCode: null,
  reason: null,
  runId: null,
  createdAt: "2026-10-26T00:00:00Z",
  ...over,
});
const recipe = (runId: string): RecipeSummary => ({ id: "r1", runId, title: "덮밥", ingredientCount: 3, unconfirmedCount: 1, createdAt: "2026-10-26T00:00:00Z" });

describe("jobCards", () => {
  it("만드는 중·실패·저장 전 완료만 카드로 보여 준다", () => {
    const cards = jobCards(
      [
        job({ id: "a", status: "running", stage: "structure" }),
        job({ id: "b", status: "failed", errorCode: "not_a_recipe" }),
        job({ id: "c", status: "succeeded", stage: "finalize", runId: "run-c" }),
        job({ id: "d", status: "succeeded", stage: "finalize", runId: "run-d" }),
      ],
      [recipe("run-d")],
    );
    expect(cards.map((c) => [c.jobId, c.kind, c.href])).toEqual([
      ["a", "working", "/jobs/a"],
      ["b", "failed", "/jobs/b"],
      ["c", "ready", "/r/run-c"],
    ]);
    expect(cards[0].detail).toBe("레시피 정리 중…");
  });

  it("작업이 없으면 빈 목록", () => {
    expect(jobCards([], [])).toEqual([]);
  });
});

describe("shortDate", () => {
  it("월/일로 보여 주고 잘못된 값은 비운다", () => {
    expect(shortDate("2026-10-26T12:00:00")).toBe("10/26");
    expect(shortDate("nope")).toBe("");
  });
});
