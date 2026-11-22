import { describe, expect, it } from "vitest";
import type { RecommendationGroup } from "@/lib/api";
import { type HomeEditorial, isIssueActive, resolveEditorial } from "./home-editorial";

const card = (runId: string) => ({ runId, title: `Recipe ${runId}`, creator: "@someone", ingredientCount: 5 });
const groups: RecommendationGroup[] = [{ id: "trending", title: "Trending now", cards: ["a", "b", "c", "d", "e"].map(card) }];

const editorial: HomeEditorial = {
  issue: {
    slug: "christmas-2026",
    label: "Holiday issue",
    title: "The Christmas Edit",
    dek: "Six festive bakes.",
    cover: { runId: "a", headline: "Tear & share tree" },
    stories: [{ runId: "b" }, { runId: "missing" }],
    quote: { text: "So easy.", runId: "b" },
    activeUntil: "2026-12-26",
  },
  note: null,
  shelves: [
    { title: "One pot, zero mess", runIds: ["c", "gone", "d"] },
    { title: "Empty shelf", runIds: ["nope"] },
  ],
  collections: [],
};

describe("resolveEditorial", () => {
  it("편집 파일의 run을 추천 카드와 묶고, 추천 목록에 없는 run은 뺀다", () => {
    const r = resolveEditorial(editorial, groups, new Date(2026, 10, 21));
    expect(r.issue?.cover.card.runId).toBe("a");
    expect(r.issue?.cover.headline).toBe("Tear & share tree");
    expect(r.issue?.stories.map((s) => s.card.runId)).toEqual(["b"]);
    expect(r.issue?.quote?.card.runId).toBe("b");
    expect(r.shelves).toEqual([{ title: "One pot, zero mess", cards: [card("c"), card("d")] }]);
    expect([...r.usedRunIds].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("커버 run이 없으면 남은 첫 이야기를 커버로 올린다", () => {
    const r = resolveEditorial({ ...editorial, issue: { ...editorial.issue!, cover: { runId: "missing" } } }, groups, new Date(2026, 10, 21));
    expect(r.issue?.cover.card.runId).toBe("b");
    expect(r.issue?.stories).toEqual([]);
  });

  it("특집 기한이 지나면 특집을 숨기고, 그 run은 Trending에 돌려준다", () => {
    const r = resolveEditorial(editorial, groups, new Date(2026, 11, 27));
    expect(r.issue).toBeNull();
    expect(r.usedRunIds.has("a")).toBe(false);
  });

  it("추천 목록을 못 받으면(빈 목록) 편집 영역도 비운다", () => {
    const r = resolveEditorial(editorial, [], new Date(2026, 10, 21));
    expect(r.issue).toBeNull();
    expect(r.shelves).toEqual([]);
  });
});

describe("isIssueActive", () => {
  it("activeUntil 당일까지 보인다", () => {
    expect(isIssueActive({ activeUntil: "2026-12-26" }, new Date(2026, 11, 26, 23, 59))).toBe(true);
    expect(isIssueActive({ activeUntil: "2026-12-26" }, new Date(2026, 11, 27, 0, 1))).toBe(false);
  });
});
