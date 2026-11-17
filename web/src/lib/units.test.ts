import { describe, expect, it } from "vitest";
import { metricHint } from "./units";

describe("metricHint", () => {
  it("미국식 부피 단위를 ml로 바꾼다", () => {
    expect(metricHint("1 cup")).toBe("about 240ml");
    expect(metricHint("1/2 cup")).toBe("about 120ml");
    expect(metricHint("1 1/2 cups")).toBe("about 360ml");
    expect(metricHint("two cups")).toBe("about 480ml");
    expect(metricHint("4 fl oz")).toBe("about 120ml");
    expect(metricHint("1 quart")).toBe("about 950ml");
  });

  it("무게 단위를 g으로 바꾼다", () => {
    expect(metricHint("8 oz")).toBe("about 230g");
    expect(metricHint("1 lb")).toBe("about 450g");
    expect(metricHint("2.5 pounds")).toBe("about 1.1kg");
  });

  it("스틱은 버터일 때만 바꾼다", () => {
    expect(metricHint("1 stick", "unsalted butter")).toBe("about 110g");
    expect(metricHint("1 stick", "버터")).toBe("about 110g");
    expect(metricHint("1 stick", "cinnamon")).toBeNull();
    expect(metricHint("1 stick", "celery")).toBeNull();
    expect(metricHint("1 stick")).toBeNull();
  });

  it("범위와 'and a half'를 읽는다", () => {
    expect(metricHint("2-3 cups")).toBe("about 480–720ml");
    // 뒤쪽이 1000을 넘으면 앞뒤 모두 L
    expect(metricHint("3-5 cups")).toBe("about 0.7–1.2L");
    expect(metricHint("2-3 lbs")).toBe("about 0.9–1.4kg");
    expect(metricHint("one and a half cups")).toBe("about 360ml");
    expect(metricHint("about 1 cup")).toBe("about 240ml");
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
