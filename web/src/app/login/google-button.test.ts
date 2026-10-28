import { describe, expect, it } from "vitest";
import { safeNext } from "./google-button";

describe("safeNext", () => {
  it("우리 사이트 안 경로만 받는다", () => {
    expect(safeNext("/r/run-1")).toBe("/r/run-1");
    expect(safeNext(null)).toBe("/book");
    expect(safeNext("https://evil.example")).toBe("/book");
    expect(safeNext("//evil.example")).toBe("/book");
    expect(safeNext("/\\evil.example")).toBe("/book");
    expect(safeNext("/\t/evil.example")).toBe("/book");
    expect(safeNext("/r/run-1?x=1#a")).toBe("/r/run-1?x=1#a");
  });
});
