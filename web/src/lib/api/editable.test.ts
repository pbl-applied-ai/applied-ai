import { describe, expect, it } from "vitest";
import { editIngredient, toEditable } from "./editable";
import { SAMPLE_RECIPE } from "./fixtures";
import type { Run } from "./types";

const run: Run = { id: "run-1", sourceUrl: "https://youtube.com/shorts/Smpl0Gochu1", recipe: SAMPLE_RECIPE, createdAt: "2026-10-25T00:00:00Z" };
const draft = toEditable(run);
// ing-1 기름 '살짝만'(확인됨), ing-2 마늘(분량 없음)
const find = (d: typeof draft, id: string) => d.ingredients.find((ing) => ing.id === id)!;

describe("editIngredient", () => {
  it("아무것도 안 바꾸고 저장하면 수정 표시가 붙지 않는다", () => {
    const next = editIngredient(draft, "ing-1", { name: "기름", amount_raw: "살짝만" });
    expect(find(next, "ing-1")).toEqual(find(draft, "ing-1"));
  });

  it("이름만 바꾸면 확인된 분량은 그대로다", () => {
    const ing = find(editIngredient(draft, "ing-1", { name: "식용유", amount_raw: "살짝만" }), "ing-1");
    expect(ing).toMatchObject({ name: "식용유", amount_status: "confirmed", edited: true, user_entered: false });
  });

  it("확인된 분량을 바꾸면 확인 필요 + 직접 입력이 된다", () => {
    const ing = find(editIngredient(draft, "ing-1", { amount_raw: "1큰술" }), "ing-1");
    expect(ing).toMatchObject({ amount_raw: "1큰술", amount_status: "unconfirmed", edited: true, user_entered: true });
  });

  it("확인된 분량을 지우면 확인 필요가 되고 직접 입력은 아니다", () => {
    const ing = find(editIngredient(draft, "ing-1", { amount_raw: "  " }), "ing-1");
    expect(ing).toMatchObject({ amount_raw: null, amount_status: "unconfirmed", edited: true, user_entered: false });
  });

  it("빈 분량을 채우면 직접 입력이다", () => {
    const ing = find(editIngredient(draft, "ing-2", { amount_raw: "2쪽" }), "ing-2");
    expect(ing).toMatchObject({ amount_raw: "2쪽", amount_status: "unconfirmed", user_entered: true });
  });
});
