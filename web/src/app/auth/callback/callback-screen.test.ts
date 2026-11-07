import { describe, expect, it } from "vitest";
import { retryLoginHref } from "./callback-screen";

describe("retryLoginHref", () => {
  it("keeps the screen to return to", () => {
    expect(retryLoginHref("/r/abc?edit=1")).toBe("/login?next=%2Fr%2Fabc%3Fedit%3D1");
  });

  it("is the plain login page when there is nothing to return to", () => {
    expect(retryLoginHref(null)).toBe("/login");
  });

  it("does not pass on another site", () => {
    expect(retryLoginHref("https://evil.example")).toBe("/login?next=%2Fbook");
  });
});
