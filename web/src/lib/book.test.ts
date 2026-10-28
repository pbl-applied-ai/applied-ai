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
const AFTER = Date.parse("2026-10-26T12:00:00Z"); // 작업(10/26 0시)보다 뒤에 저장·삭제함
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

  it("저장했다가 지운 레시피는 준비됐어요 카드로 되살아나지 않는다", () => {
    const done = job({ id: "c", status: "succeeded", stage: "finalize", runId: "run-c" });
    expect(jobCards([done], [], { runs: new Map([["run-c", AFTER]]), jobs: new Set() })).toEqual([]);
  });

  it("지운 뒤 같은 영상을 다시 넣어 같은 runId가 나오면 준비됐어요 카드를 보여 준다", () => {
    const again = job({ id: "c2", status: "succeeded", stage: "finalize", runId: "run-c", createdAt: "2026-10-27T00:00:00Z" });
    expect(jobCards([again], [], { runs: new Map([["run-c", AFTER]]), jobs: new Set() }).map((c) => c.kind)).toEqual(["ready"]);
  });

  it("찾은 만큼 보기로 저장한 실패 작업은 실패 카드를 빼고, 저장 전이면 남긴다", () => {
    const partial = job({ id: "p", status: "failed", errorCode: "insufficient", reason: "partial_recipe", runId: "run-p" });
    expect(jobCards([partial], [recipe("run-p")])).toEqual([]);
    expect(jobCards([partial], [], { runs: new Map([["run-p", AFTER]]), jobs: new Set() })).toEqual([]);
    expect(jobCards([partial], []).map((c) => c.kind)).toEqual(["failed"]);
  });

  it("닫은 실패 카드는 다시 보이지 않는다", () => {
    const cards = jobCards(
      [job({ id: "x", status: "failed", errorCode: "not_a_recipe" }), job({ id: "y", status: "failed", errorCode: "retryable" })],
      [],
      { runs: new Map(), jobs: new Set(["x"]) },
    );
    expect(cards.map((c) => c.jobId)).toEqual(["y"]);
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
