import { describe, expect, it } from "vitest";
import { metricHint } from "./units";

describe("metricHint", () => {
  it("미국식 부피 단위를 ml로 바꾼다", () => {
    expect(metricHint("1 cup")).toBe("약 240ml");
    expect(metricHint("1/2 cup")).toBe("약 120ml");
    expect(metricHint("1 1/2 cups")).toBe("약 360ml");
    expect(metricHint("two cups")).toBe("약 480ml");
    expect(metricHint("4 fl oz")).toBe("약 120ml");
    expect(metricHint("1 quart")).toBe("약 950ml");
  });

  it("무게 단위를 g으로 바꾼다", () => {
    expect(metricHint("8 oz")).toBe("약 230g");
    expect(metricHint("1 lb")).toBe("약 450g");
    expect(metricHint("2.5 pounds")).toBe("약 1.1kg");
    expect(metricHint("1 stick")).toBe("약 110g");
  });

  it("범위와 'and a half'를 읽는다", () => {
    expect(metricHint("2-3 cups")).toBe("약 480~720ml");
    expect(metricHint("one and a half cups")).toBe("약 360ml");
    expect(metricHint("about 1 cup")).toBe("약 240ml");
  });

  it("바꿀 필요가 없거나 모르는 분량은 그대로 둔다", () => {
    expect(metricHint("2 tbsp")).toBeNull();
    expect(metricHint("1 tsp")).toBeNull();
    expect(metricHint("200g")).toBeNull();
    expect(metricHint("1 cup (240ml)")).toBeNull();
    expect(metricHint("2컵")).toBeNull();
    expect(metricHint("a pinch")).toBeNull();
    expect(metricHint("to taste")).toBeNull();
    expect(metricHint("2 cloves")).toBeNull();
    expect(metricHint(null)).toBeNull();
  });
});
