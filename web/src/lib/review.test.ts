import { describe, expect, it } from "vitest";
import { acceptAllEstimates, acceptEstimate, addIngredient, addStep, canSave, editIngredient, editStep, estimateCount, revertItem, toEditable, withoutEstimates, type Run } from "@/lib/api";
import { PARTIAL_RECIPE, SAMPLE_RECIPE } from "@/lib/api/fixtures";
import { amountView, descriptionNotice, isDescriptionOnly, isUserAdded, missingParts, saveBlocker } from "./review";

const run: Run = { id: "run-1", sourceUrl: "https://www.youtube.com/shorts/Smpl0Gochu1", recipe: SAMPLE_RECIPE, createdAt: "" };
const partial: Run = { ...run, id: "run-2", recipe: PARTIAL_RECIPE };

describe("분량 표시 3가지", () => {
  it("영상에서 확인 / 영상에서 확인 안 됨 / 직접 입력", () => {
    const draft = toEditable(run);
    const [oil, garlic] = draft.ingredients;
    expect(amountView(oil)).toEqual({ kind: "confirmed", text: "just a little" });
    expect(amountView(garlic)).toEqual({ kind: "missing" });

    const filled = editIngredient(draft, garlic.id, { amount_raw: "3 cloves" });
    expect(amountView(filled.ingredients[1])).toEqual({ kind: "user", text: "3 cloves" });

    const changed = editIngredient(draft, oil.id, { amount_raw: "1 tbsp" });
    expect(amountView(changed.ingredients[0])).toEqual({ kind: "user", text: "1 tbsp" });

    // 이름만 고치거나 그대로 저장하면 영상에서 확인한 분량 그대로다
    const renamed = editIngredient(draft, oil.id, { name: "Vegetable oil", amount_raw: "just a little" });
    expect(amountView(renamed.ingredients[0])).toEqual({ kind: "confirmed", text: "just a little" });
    const same = editIngredient(draft, oil.id, { name: oil.name, amount_raw: oil.amount_raw });
    expect(same.ingredients[0].edited).toBe(false);
  });

  it("되돌리기는 추출 결과로 복원한다", () => {
    const draft = editIngredient(toEditable(run), "ing-2", { amount_raw: "3 cloves" });
    const reverted = revertItem(draft, run, "ing-2");
    expect(amountView(reverted.ingredients[1])).toEqual({ kind: "missing" });
    expect(reverted.ingredients[1].edited).toBe(false);

    const step = revertItem(editStep(draft, "step-1", "Edited step"), run, "step-1");
    expect(step.steps[0].text).toBe(SAMPLE_RECIPE.steps[0].text);
  });

  it("사용자가 추가한 항목은 되돌릴 원본이 없다", () => {
    const draft = addStep(addIngredient(toEditable(run), "Salt", "a pinch"), "Taste and season.");
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
    expect(saveBlocker(draft)).toBe("Add at least one step to save.");
    const fixed = addStep(draft, "Stir-fry.");
    expect(canSave(fixed)).toBe(true);
    expect(saveBlocker(fixed)).toBeNull();
  });

  it("요리명이 비면 저장할 수 없다", () => {
    expect(saveBlocker({ ...toEditable(run), title: " " })).toBe("Add a dish name to save.");
  });
});

describe("설명 기반 안내", () => {
  it("근거가 설명·제목·고정 댓글뿐일 때만", () => {
    expect(isDescriptionOnly(run)).toBe(false);
    const descOnly: Run = {
      ...run,
      recipe: {
        ...SAMPLE_RECIPE,
        ingredients: [{ name: "Cooked rice", amount_raw: "1 bowl", amount_status: "confirmed", evidence: ["desc-0"] }],
        steps: [{ order: 1, text: "Stir-fry.", evidence: ["title-0", "desc-1"] }],
      },
    };
    expect(isDescriptionOnly(descOnly)).toBe(true);

    const withComment: Run = { ...descOnly, recipe: { ...descOnly.recipe, steps: [{ order: 1, text: "Stir-fry.", evidence: ["comment-0"] }] } };
    expect(isDescriptionOnly(withComment)).toBe(true);
    const withSpeech: Run = { ...descOnly, recipe: { ...descOnly.recipe, steps: [{ order: 1, text: "Stir-fry.", evidence: ["comment-0", "asr-3"] }] } };
    expect(isDescriptionOnly(withSpeech)).toBe(false);
  });

  it("안내 문구는 출처에 맞게 하나만", () => {
    expect(descriptionNotice(run)).toBeNull();
    const descOnly: Run = {
      ...run,
      recipe: {
        ...SAMPLE_RECIPE,
        ingredients: [{ name: "Cooked rice", amount_raw: "1 bowl", amount_status: "confirmed", evidence: ["desc-0"] }],
        steps: [{ order: 1, text: "Stir-fry.", evidence: ["title-0", "desc-1"] }],
      },
    };
    expect(descriptionNotice(descOnly)).toBe("Made from the video description only.");
    const withComment: Run = { ...descOnly, recipe: { ...descOnly.recipe, steps: [{ order: 1, text: "Stir-fry.", evidence: ["comment-0"] }] } };
    expect(descriptionNotice(withComment)).toBe("Made from the video description and pinned comment only.");
    // Instagram은 캡션이 desc 구간으로 들어온다. 말소리를 못 받았거나 말소리가 없던 결과다.
    const reel: Run = { ...descOnly, sourceUrl: "https://www.instagram.com/reel/AbC123dEf45/" };
    expect(descriptionNotice(reel)).toBe("Made from the caption only.");
    const reelWithSpeech: Run = { ...reel, recipe: { ...reel.recipe, steps: [{ order: 1, text: "Stir-fry.", evidence: ["asr-0"] }] } };
    expect(descriptionNotice(reelWithSpeech)).toBeNull();
    expect(descriptionNotice({ ...descOnly, sourceUrl: "" })).toBe("Made from the video description only.");
  });
});

describe("추정 분량 (KAN-66)", () => {
  const estimated: Run = {
    ...run,
    recipe: {
      ...SAMPLE_RECIPE,
      ingredients: SAMPLE_RECIPE.ingredients.map((ing) =>
        ing.name === "Garlic"
          ? { ...ing, amount_estimate: { text: "4-5 cloves", basis: "for one serving" } }
          : ing.name === "Pork shoulder"
            ? { ...ing, amount_estimate: { text: "200g" } }
            : ing,
      ),
    },
  };

  it("확인 안 된 분량에 추정값이 있으면 영상 값과 따로 \"추정\"으로 보여 준다", () => {
    const draft = toEditable(estimated);
    expect(amountView(draft.ingredients[1])).toEqual({ kind: "estimate", text: "4-5 cloves", basis: "for one serving" });
    expect(amountView(draft.ingredients[3])).toEqual({ kind: "estimate", text: "200g", basis: null });
    expect(amountView(draft.ingredients[0])).toEqual({ kind: "confirmed", text: "just a little" });
    expect(estimateCount(draft)).toBe(2);
  });

  it("확인된 분량에 잘못 붙은 추정값은 쓰지 않는다", () => {
    const wrong: Run = {
      ...run,
      recipe: { ...SAMPLE_RECIPE, ingredients: [{ ...SAMPLE_RECIPE.ingredients[0], amount_estimate: { text: "1 tbsp" } }] },
    };
    const draft = toEditable(wrong);
    expect(amountView(draft.ingredients[0])).toEqual({ kind: "confirmed", text: "just a little" });
    expect(estimateCount(draft)).toBe(0);
  });

  it("추정값을 쓰면 직접 입력이 되고, 되돌리면 다시 추정이다", () => {
    const used = acceptEstimate(toEditable(estimated), "ing-2");
    expect(amountView(used.ingredients[1])).toEqual({ kind: "user", text: "4-5 cloves" });
    expect(used.ingredients[1].user_entered).toBe(true);
    expect(used.ingredients[1].amount_status).toBe("unconfirmed");
    expect(estimateCount(used)).toBe(1);

    const reverted = revertItem(used, estimated, "ing-2");
    expect(amountView(reverted.ingredients[1]).kind).toBe("estimate");
  });

  it("추정값을 고쳐 쓰면 고친 값이 직접 입력이다", () => {
    const fixed = editIngredient(toEditable(estimated), "ing-2", { amount_raw: "3 cloves" });
    expect(amountView(fixed.ingredients[1])).toEqual({ kind: "user", text: "3 cloves" });
  });

  it("모두 쓰기는 추정값이 있는 분량만 채운다", () => {
    const all = acceptAllEstimates(toEditable(estimated));
    expect(estimateCount(all)).toBe(0);
    expect(all.ingredients.filter((i) => i.user_entered).map((i) => i.amount_raw)).toEqual(["4-5 cloves", "200g"]);
    expect(amountView(all.ingredients[4])).toEqual({ kind: "missing" });
  });

  it("저장할 때는 쓰지 않은 추정값을 뺀다", () => {
    const saved = withoutEstimates(acceptEstimate(toEditable(estimated), "ing-2"));
    expect(saved.ingredients.some((i) => "amount_estimate" in i)).toBe(false);
    expect(saved.ingredients[1].amount_raw).toBe("4-5 cloves");
    expect(saved.ingredients[3].amount_raw).toBeNull();
  });
});
