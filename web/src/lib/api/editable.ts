// 확인·수정 화면(S4)의 편집 함수. 모두 새 객체를 돌려준다(React state에 그대로 넣으면 된다).
import type { EditableIngredient, EditableRecipe, EditableStep, RecipeSummary, Run, UserRecipe } from './types';

// 추출 결과 → 편집 상태. 항목 ID는 추출 결과의 순서로 붙여서, 되돌리기 때 같은 ID 항목을 찾는다.
export function toEditable(run: Run): EditableRecipe {
  const { recipe } = run;
  return {
    runId: run.id,
    title: recipe.title,
    servingsRaw: recipe.servings_raw ?? null,
    ingredients: recipe.ingredients.map((ing, i) => ({
      id: `ing-${i + 1}`,
      name: ing.name,
      amount_raw: ing.amount_raw,
      amount_status: ing.amount_status,
      ...(ing.optional ? { optional: true } : {}),
      edited: false,
      user_entered: false,
    })),
    steps: [...recipe.steps]
      .sort((a, b) => a.order - b.order)
      .map((step, i) => ({ id: `step-${i + 1}`, text: step.text, edited: false, user_entered: false })),
  };
}

// ── 재료 ──────────────────────────────────────────────────

export function editIngredient(
  draft: EditableRecipe,
  id: string,
  patch: Partial<Pick<EditableIngredient, 'name' | 'amount_raw' | 'optional'>>,
): EditableRecipe {
  return {
    ...draft,
    ingredients: draft.ingredients.map((ing) => {
      if (ing.id !== id) return ing;
      const next = { ...ing, ...patch, edited: true };
      // 빈칸이던 분량을 사용자가 채우면 근거 없는 값이다
      if ('amount_raw' in patch) {
        next.amount_raw = patch.amount_raw?.trim() ? patch.amount_raw.trim() : null;
        if (ing.amount_status === 'unconfirmed' && next.amount_raw) next.user_entered = true;
      }
      return next;
    }),
  };
}

export function addIngredient(draft: EditableRecipe, name: string, amountRaw: string | null = null): EditableRecipe {
  const item: EditableIngredient = {
    id: nextId('ing-user', draft.ingredients),
    name: name.trim(),
    amount_raw: amountRaw?.trim() || null,
    amount_status: 'unconfirmed',
    edited: true,
    user_entered: true,
  };
  return { ...draft, ingredients: [...draft.ingredients, item] };
}

export function removeIngredient(draft: EditableRecipe, id: string): EditableRecipe {
  return { ...draft, ingredients: draft.ingredients.filter((ing) => ing.id !== id) };
}

// ── 조리 순서 ─────────────────────────────────────────────

export function editStep(draft: EditableRecipe, id: string, text: string): EditableRecipe {
  return {
    ...draft,
    steps: draft.steps.map((step) => (step.id === id ? { ...step, text, edited: true } : step)),
  };
}

export function addStep(draft: EditableRecipe, text: string): EditableRecipe {
  const item: EditableStep = { id: nextId('step-user', draft.steps), text: text.trim(), edited: true, user_entered: true };
  return { ...draft, steps: [...draft.steps, item] };
}

export function removeStep(draft: EditableRecipe, id: string): EditableRecipe {
  return { ...draft, steps: draft.steps.filter((step) => step.id !== id) };
}

export function moveStep(draft: EditableRecipe, id: string, offset: -1 | 1): EditableRecipe {
  const from = draft.steps.findIndex((step) => step.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= draft.steps.length) return draft;
  const steps = [...draft.steps];
  [steps[from], steps[to]] = [steps[to], steps[from]];
  return { ...draft, steps };
}

// ── 되돌리기: 같은 ID 항목을 추출 결과로 바꾼다 ───────────────

export function revertItem(draft: EditableRecipe, run: Run, id: string): EditableRecipe {
  const original = toEditable(run);
  const ing = original.ingredients.find((item) => item.id === id);
  if (ing) {
    return { ...draft, ingredients: draft.ingredients.map((item) => (item.id === id ? ing : item)) };
  }
  const step = original.steps.find((item) => item.id === id);
  if (step) {
    return { ...draft, steps: draft.steps.map((item) => (item.id === id ? step : item)) };
  }
  return draft; // 사용자가 추가한 항목은 되돌릴 원본이 없다
}

// ── 저장 전 확인·목록 카드 ────────────────────────────────

// 저장 버튼 활성 조건. 재료·단계 둘 다 1개 이상(worker-interface.md 6번: 한쪽만 있으면 사용자가 채워야 저장)
export function canSave(draft: EditableRecipe): boolean {
  return (
    draft.title.trim().length > 0 &&
    draft.ingredients.some((ing) => ing.name.trim()) &&
    draft.steps.some((step) => step.text.trim())
  );
}

export function unconfirmedCount(draft: EditableRecipe): number {
  return draft.ingredients.filter((ing) => !ing.amount_raw).length;
}

export function toSummary(recipe: UserRecipe): RecipeSummary {
  return {
    id: recipe.id,
    runId: recipe.runId,
    title: recipe.title,
    ingredientCount: recipe.ingredients.length,
    unconfirmedCount: unconfirmedCount(recipe),
    createdAt: recipe.createdAt,
  };
}

function nextId(prefix: string, items: { id: string }[]): string {
  let n = 1;
  while (items.some((item) => item.id === `${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
