// H Home 추천 카드 표시 규칙(docs/screen-data.md 2절 H, 3절 6·8번).

// 취향 칩(11/20 수빈 결정, #74). id는 featured_runs.categories에 넣는 태그와 같다.
// 시즌(크리스마스 등)은 칩이 아니라 홈 아래 시즌 특집으로 보여 준다.
export const FEATURED_CHIPS = [
  { id: "all", label: "All", emoji: "⭐" },
  { id: "vegan", label: "Vegan", emoji: "🥬" },
  { id: "late_night", label: "Late night", emoji: "🌙" },
  { id: "dessert", label: "Dessert", emoji: "🍰" },
  { id: "high_protein", label: "High protein", emoji: "💪" },
] as const;

export type FeaturedChipId = (typeof FEATURED_CHIPS)[number]["id"];

const SAVE_COUNT_MIN = 10; // 이보다 적으면 저장 수를 숨긴다. 가짜 숫자는 쓰지 않는다(3절 6번)

/** "12K saves". 10 미만이거나 모르면 null(숨김) */
export function saveCountText(count: number | null | undefined): string | null {
  if (count == null || count < SAVE_COUNT_MIN) return null;
  if (count < 1000) return `${count} saves`;
  const k = count / 1000;
  return `${k < 10 ? Math.floor(k * 10) / 10 : Math.floor(k)}K saves`;
}
