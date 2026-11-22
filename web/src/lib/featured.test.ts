import { describe, expect, it } from "vitest";
import { FEATURED_CHIPS, saveCountText } from "./featured";

describe("featured", () => {
  it("chips are the taste tags, not seasons", () => {
    expect(FEATURED_CHIPS.map((c) => c.id)).toEqual(["all", "vegan", "late_night", "dessert", "high_protein"]);
  });

  it("hides save counts under 10 and shortens thousands", () => {
    expect(saveCountText(undefined)).toBeNull();
    expect(saveCountText(0)).toBeNull();
    expect(saveCountText(9)).toBeNull();
    expect(saveCountText(10)).toBe("10 saves");
    expect(saveCountText(999)).toBe("999 saves");
    expect(saveCountText(1250)).toBe("1.2K saves");
    expect(saveCountText(12400)).toBe("12K saves");
  });
});
