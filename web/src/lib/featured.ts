// H Home의 추천 카드 표시 규칙(docs/screen-data.md #57 2절 H).
// 추천은 20~40편이라 서버 검색 없이 받은 목록을 웹에서 거른다.
import type { FeaturedCategory, FeaturedRecipe } from "@/lib/api";

// 칩은 11/14 정한 추천 묶음 4개에 맞춘다(#57 3절 8번). 시안의 Pasta·Dessert는 예시로 본다.
export const FEATURED_CHIPS: { id: FeaturedCategory | "all"; label: string; emoji: string }[] = [
  { id: "all", label: "All", emoji: "⭐" },
  { id: "thanksgiving", label: "Thanksgiving", emoji: "🦃" },
  { id: "christmas", label: "Christmas", emoji: "🎄" },
  { id: "budget", label: "Budget", emoji: "💰" },
  { id: "quick", label: "Quick & easy", emoji: "⏱️" },
];

const SAVE_COUNT_MIN = 10; // 이보다 적으면 저장 수를 숨긴다. 가짜 숫자는 쓰지 않는다(#57 3절 6번)

/** 요리명·재료 이름에 검색어가 들어 있고, 고른 칩에 속한 카드만. 대소문자·앞뒤 공백은 무시한다. */
export function filterFeatured(
  list: FeaturedRecipe[],
  query: string,
  category: FeaturedCategory | "all",
): FeaturedRecipe[] {
  const q = query.trim().toLowerCase();
  return list.filter((r) => {
    if (category !== "all" && !r.categories.includes(category)) return false;
    if (!q) return true;
    return [r.title, ...r.ingredientNames].some((text) => text.toLowerCase().includes(q));
  });
}

/** "Ramen, egg, bacon, cheese"처럼 재료 앞 4개 */
export function ingredientSummary(r: Pick<FeaturedRecipe, "ingredientNames">, max = 4): string {
  const names = r.ingredientNames.slice(0, max).join(", ");
  return names ? names.charAt(0).toUpperCase() + names.slice(1) : "";
}

/** "12K saves". 10 미만이면 null(숨김) */
export function saveCountText(count: number): string | null {
  if (count < SAVE_COUNT_MIN) return null;
  if (count < 1000) return `${count} saves`;
  const k = count / 1000;
  return `${k < 10 ? Math.floor(k * 10) / 10 : Math.floor(k)}K saves`;
}

/** 영상 길이 "0:21". 모르면 null */
export function durationText(ms: number | null): string | null {
  if (ms == null || ms <= 0) return null;
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export const PLATFORM_LABEL: Record<FeaturedRecipe["platform"], string> = {
  youtube: "Shorts",
  instagram: "Reels",
  upload: "Video",
};
