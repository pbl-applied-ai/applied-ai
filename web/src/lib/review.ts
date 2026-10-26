// S4 확인·수정 화면의 표시 규칙. 편집 자체는 @/lib/api의 editable.ts가 한다.
import type { EditableIngredient, EditableRecipe, Run } from "@/lib/api";

/** 근거가 모두 영상 설명·제목뿐이면 "설명 기반" 결과다(docs/ux-flow.md S4). */
export function isDescriptionOnly(run: Run): boolean {
  const ids = [...run.recipe.ingredients, ...run.recipe.steps].flatMap((item) => item.evidence);
  return ids.length > 0 && ids.every((id) => id.startsWith("desc-") || id.startsWith("title-"));
}

/** 추출 결과에서 비어 있던 쪽. 부분 결과(partial_recipe) 안내에 쓴다. */
export function missingParts(run: Run): { ingredients: boolean; steps: boolean } {
  return { ingredients: run.recipe.ingredients.length === 0, steps: run.recipe.steps.length === 0 };
}

export type AmountView =
  | { kind: "confirmed"; text: string }
  | { kind: "missing" }
  | { kind: "user"; text: string };

/** 분량 표시 3가지(UX v0.4): 영상에서 확인한 원문 / 영상에서 확인 안 됨 / 직접 입력 */
export function amountView(ing: EditableIngredient): AmountView {
  if (!ing.amount_raw) return { kind: "missing" };
  // 사용자가 채웠거나 고친 분량은 영상에서 확인한 값이 아니다(editIngredient가 user_entered를 붙인다).
  // 이름만 고친 재료의 분량은 그대로 영상에서 확인한 값이다.
  if (ing.user_entered) return { kind: "user", text: ing.amount_raw };
  return { kind: "confirmed", text: ing.amount_raw };
}

/** 사용자가 추가한 항목은 되돌릴 원본이 없어 [삭제]만 보인다. */
export function isUserAdded(id: string): boolean {
  return id.startsWith("ing-user-") || id.startsWith("step-user-");
}

/** 저장 버튼 아래에 보여 줄, 저장할 수 없는 이유. */
export function saveBlocker(draft: EditableRecipe): string | null {
  if (!draft.title.trim()) return "요리명을 입력하면 저장할 수 있어요.";
  if (!draft.ingredients.some((i) => i.name.trim())) return "재료를 하나 이상 넣으면 저장할 수 있어요.";
  if (!draft.steps.some((s) => s.text.trim())) return "조리 순서를 하나 이상 넣으면 저장할 수 있어요.";
  return null;
}
