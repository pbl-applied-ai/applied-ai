import { describe, expect, it } from "vitest";
import { metricHint, usFirst } from "./units";

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

describe("usFirst", () => {
  it("puts the US unit first when the metric one leads", () => {
    expect(usFirst("1360g (48oz)")).toBe("48oz (1360g)");
    expect(usFirst("200ml (3/4 cup) milk")).toBe("3/4 cup (200ml) milk");
    expect(usFirst("about 450 g (1 lb)")).toBe("1 lb (about 450 g)");
    expect(usFirst("1.5 kg (3.3 lbs)")).toBe("3.3 lbs (1.5 kg)");
  });
  it("leaves other amounts as they are", () => {
    expect(usFirst("48oz (1360g)")).toBe("48oz (1360g)");
    expect(usFirst("1 can (15 oz)")).toBe("1 can (15 oz)");
    expect(usFirst("500g")).toBe("500g");
    expect(usFirst("2 tbsp")).toBe("2 tbsp");
    expect(usFirst("100g (about half a pack)")).toBe("100g (about half a pack)");
    expect(usFirst("to taste")).toBe("to taste");
  });
});
