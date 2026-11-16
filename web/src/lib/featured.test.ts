import { describe, expect, it } from "vitest";
import type { FeaturedRecipe } from "@/lib/api";
import { durationText, filterFeatured, ingredientSummary, saveCountText } from "./featured";

const card = (title: string, ingredientNames: string[], categories: FeaturedRecipe["categories"]): FeaturedRecipe => ({
  runId: `run-${title}`,
  title,
  creator: "c",
  platform: "youtube",
  durationMs: 21000,
  thumbnailUrl: null,
  ingredientNames,
  ingredientCount: ingredientNames.length,
  stepCount: 3,
  categories,
  saveCount: 0,
});

const list = [
  card("Kimchi fried rice", ["rice", "kimchi", "egg"], ["budget", "quick"]),
  card("Roast turkey", ["turkey", "butter"], ["thanksgiving"]),
  card("Rolled omelette", ["egg", "scallion"], ["budget"]),
];

describe("홈 추천 거르기 (KAN-74)", () => {
  it("칩만 고르면 그 묶음, All이면 전부", () => {
    expect(filterFeatured(list, "", "all")).toHaveLength(3);
    expect(filterFeatured(list, "", "budget").map((r) => r.title)).toEqual(["Kimchi fried rice", "Rolled omelette"]);
  });

  it("검색은 요리명·재료 이름에서 대소문자·공백 무시", () => {
    expect(filterFeatured(list, "  EGG ", "all").map((r) => r.title)).toEqual(["Kimchi fried rice", "Rolled omelette"]);
    expect(filterFeatured(list, "turkey", "all")).toHaveLength(1);
    expect(filterFeatured(list, "egg", "thanksgiving")).toEqual([]);
  });
});

describe("추천 카드 문구", () => {
  it("재료 앞 4개, 첫 글자 대문자", () => {
    expect(ingredientSummary({ ingredientNames: ["ramen", "egg", "bacon", "cheese", "scallion"] })).toBe(
      "Ramen, egg, bacon, cheese",
    );
    expect(ingredientSummary({ ingredientNames: [] })).toBe("");
  });

  it("저장 수는 10 미만이면 숨기고, 천 단위는 K", () => {
    expect(saveCountText(9)).toBeNull();
    expect(saveCountText(96)).toBe("96 saves");
    expect(saveCountText(2350)).toBe("2.3K saves");
    expect(saveCountText(12400)).toBe("12K saves");
  });

  it("영상 길이 m:ss, 모르면 null", () => {
    expect(durationText(21000)).toBe("0:21");
    expect(durationText(75400)).toBe("1:15");
    expect(durationText(null)).toBeNull();
  });
});
