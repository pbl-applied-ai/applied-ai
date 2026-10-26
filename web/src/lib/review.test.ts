import { describe, expect, it } from "vitest";
import { addIngredient, addStep, canSave, editIngredient, editStep, revertItem, toEditable, type Run } from "@/lib/api";
import { PARTIAL_RECIPE, SAMPLE_RECIPE } from "@/lib/api/fixtures";
import { amountView, isDescriptionOnly, isUserAdded, missingParts, saveBlocker } from "./review";

const run: Run = { id: "run-1", sourceUrl: "https://www.youtube.com/shorts/Smpl0Gochu1", recipe: SAMPLE_RECIPE, createdAt: "" };
const partial: Run = { ...run, id: "run-2", recipe: PARTIAL_RECIPE };

describe("분량 표시 3가지", () => {
  it("영상에서 확인 / 영상에서 확인 안 됨 / 직접 입력", () => {
    const draft = toEditable(run);
    const [oil, garlic] = draft.ingredients;
    expect(amountView(oil)).toEqual({ kind: "confirmed", text: "살짝만" });
    expect(amountView(garlic)).toEqual({ kind: "missing" });

    const filled = editIngredient(draft, garlic.id, { amount_raw: "3쪽" });
    expect(amountView(filled.ingredients[1])).toEqual({ kind: "user", text: "3쪽" });

    const changed = editIngredient(draft, oil.id, { amount_raw: "1큰술" });
    expect(amountView(changed.ingredients[0])).toEqual({ kind: "user", text: "1큰술" });
  });

  it("되돌리기는 추출 결과로 복원한다", () => {
    const draft = editIngredient(toEditable(run), "ing-2", { amount_raw: "3쪽" });
    const reverted = revertItem(draft, run, "ing-2");
    expect(amountView(reverted.ingredients[1])).toEqual({ kind: "missing" });
    expect(reverted.ingredients[1].edited).toBe(false);

    const step = revertItem(editStep(draft, "step-1", "바꾼 문장"), run, "step-1");
    expect(step.steps[0].text).toBe(SAMPLE_RECIPE.steps[0].text);
  });

  it("사용자가 추가한 항목은 되돌릴 원본이 없다", () => {
    const draft = addStep(addIngredient(toEditable(run), "소금", "약간"), "간을 본다.");
    expect(isUserAdded(draft.ingredients.at(-1)!.id)).toBe(true);
    expect(isUserAdded(draft.steps.at(-1)!.id)).toBe(true);
    expect(isUserAdded("ing-1")).toBe(false);
  });
});

describe("부분 결과", () => {
  it("조리 순서가 없으면 안내하고, 하나 넣기 전까지 저장할 수 없다", () => {
    expect(missingParts(partial)).toEqual({ ingredients: false, steps: true });
    const draft = toEditable(partial);
    expect(canSave(draft)).toBe(false);
    expect(saveBlocker(draft)).toBe("조리 순서를 하나 이상 넣으면 저장할 수 있어요.");
    const fixed = addStep(draft, "볶는다.");
    expect(canSave(fixed)).toBe(true);
    expect(saveBlocker(fixed)).toBeNull();
  });

  it("요리명이 비면 저장할 수 없다", () => {
    expect(saveBlocker({ ...toEditable(run), title: " " })).toBe("요리명을 입력하면 저장할 수 있어요.");
  });
});

describe("설명 기반 안내", () => {
  it("근거가 설명·제목뿐일 때만", () => {
    expect(isDescriptionOnly(run)).toBe(false);
    const descOnly: Run = {
      ...run,
      recipe: {
        ...SAMPLE_RECIPE,
        ingredients: [{ name: "밥", amount_raw: "1공기", amount_status: "confirmed", evidence: ["desc-0"] }],
        steps: [{ order: 1, text: "볶는다.", evidence: ["title-0", "desc-1"] }],
      },
    };
    expect(isDescriptionOnly(descOnly)).toBe(true);
  });
});
