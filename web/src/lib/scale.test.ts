import { describe, expect, it } from "vitest";
import { formatQuantity, parseServings, scaleAmount, servingsLabel } from "./scale";

describe("scaleAmount", () => {
  it("맨 앞 숫자를 비율대로 바꾼다", () => {
    expect(scaleAmount("2 tbsp", 2)).toBe("4 tbsp");
    expect(scaleAmount("1 1/2 cups", 2)).toBe("3 cups");
    expect(scaleAmount("1 cup", 0.5)).toBe("1/2 cup");
    expect(scaleAmount("½ tsp", 3)).toBe("1 1/2 tsp");
    expect(scaleAmount("2-3 cloves", 2)).toBe("4-6 cloves");
    expect(scaleAmount("about 1 lb", 1.5)).toBe("about 1 1/2 lb");
    expect(scaleAmount("two cups", 2)).toBe("4 cups");
  });

  it("2 이상이 되면 아는 단위만 복수형으로, 1 이하로 줄면 단수로", () => {
    expect(scaleAmount("1 clove", 2)).toBe("2 cloves");
    expect(scaleAmount("1 can (15 oz)", 3)).toBe("3 cans (15 oz)");
    expect(scaleAmount("2 cups", 0.5)).toBe("1 cup");
    expect(scaleAmount("1 medium", 2)).toBe("2 medium");
  });

  it("계량 단위 뒤 괄호는 같이 바꾸고, 통 크기 괄호는 그대로 둔다", () => {
    expect(scaleAmount("1360g (48oz)", 0.5)).toBe("680g (24oz)");
    expect(scaleAmount("1 cup (240ml)", 2)).toBe("2 cups (480ml)");
    expect(scaleAmount("1 can (14.5 oz)", 2)).toBe("2 cans (14.5 oz)");
  });

  it("g·ml는 분수 대신 정수로", () => {
    expect(scaleAmount("150g", 1.5)).toBe("225g");
    expect(scaleAmount("200 ml", 0.5)).toBe("100 ml");
    expect(scaleAmount("15g", 1 / 3)).toBe("5g");
  });

  it("숫자가 없는 분량과 1배는 그대로", () => {
    for (const text of ["a little bit", "to taste", "a pinch", "a splash of milk", "some"]) {
      expect(scaleAmount(text, 2)).toBe(text);
    }
    expect(scaleAmount("2 tbsp", 1)).toBe("2 tbsp");
  });
});

describe("formatQuantity", () => {
  it("흔한 분수로 맞추고 안 맞으면 소수 한 자리", () => {
    expect(formatQuantity(0.25)).toBe("1/4");
    expect(formatQuantity(1 / 3)).toBe("1/3");
    expect(formatQuantity(2.5)).toBe("2 1/2");
    expect(formatQuantity(0.4)).toBe("0.4");
    expect(formatQuantity(12.4)).toBe("12");
    expect(formatQuantity(3)).toBe("3");
    // 아주 작은 값은 1/8로 올리지 않는다(#83 리뷰)
    expect(formatQuantity(1 / 16)).toBe("1/16");
    expect(formatQuantity(0.03)).toBe("0.03");
    expect(formatQuantity(2 + 1 / 16)).toBe("2");
    expect(scaleAmount("1/4 tsp", 0.25)).toBe("1/16 tsp");
  });
});

describe("parseServings", () => {
  it("인분과 개수를 읽는다", () => {
    expect(parseServings("Serves 4")).toEqual({ count: 4, unit: "servings" });
    expect(parseServings("Serves: 4")).toEqual({ count: 4, unit: "servings" });
    expect(parseServings("Serves 1-2")).toEqual({ count: 2, unit: "servings" });
    expect(parseServings("Makes: 8 cookies")).toEqual({ count: 8, unit: "cookies" });
    expect(parseServings("4 people")).toEqual({ count: 4, unit: "servings" });
  });

  it("숫자가 없으면 null", () => {
    expect(parseServings(null)).toBeNull();
    expect(parseServings("a family dinner")).toBeNull();
  });

  it("라벨", () => {
    expect(servingsLabel(1, "servings")).toBe("1 serving");
    expect(servingsLabel(6, "servings")).toBe("6 servings");
    expect(servingsLabel(1, "cookies")).toBe("1 cookie");
  });
});

describe("scaleAmount 경계", () => {
  it("숫자 말로 시작하는 다른 낱말은 건드리지 않는다", () => {
    expect(scaleAmount("tender stems", 2)).toBe("tender stems");
    expect(scaleAmount("oneish cup", 2)).toBe("oneish cup");
  });
});
