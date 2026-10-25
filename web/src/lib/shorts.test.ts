import { describe, expect, it } from "vitest";
import { checkShortsUrl } from "./shorts";

describe("checkShortsUrl", () => {
  it("Shorts 링크를 받고 주소를 정리한다", () => {
    for (const input of [
      "https://www.youtube.com/shorts/AbCdEfGhIj0",
      "https://youtube.com/shorts/AbCdEfGhIj0?si=share123",
      "m.youtube.com/shorts/AbCdEfGhIj0",
      "  youtube.com/shorts/AbCdEfGhIj0/  ",
    ]) {
      expect(checkShortsUrl(input)).toEqual({
        ok: true,
        videoId: "AbCdEfGhIj0",
        url: "https://www.youtube.com/shorts/AbCdEfGhIj0",
      });
    }
  });

  it("빈 입력은 empty", () => {
    expect(checkShortsUrl("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("Shorts가 아닌 YouTube 링크는 not_shorts", () => {
    for (const input of [
      "https://www.youtube.com/watch?v=AbCdEfGhIj0",
      "https://youtu.be/AbCdEfGhIj0",
      "https://www.youtube.com/shorts/",
      "https://www.youtube.com/shorts/short",
    ]) {
      expect(checkShortsUrl(input)).toEqual({ ok: false, reason: "not_shorts" });
    }
  });

  it("다른 서비스 링크나 주소가 아닌 글은 unsupported", () => {
    for (const input of [
      "https://www.instagram.com/reel/abc123/",
      "https://www.tiktok.com/@user/video/123",
      "https://notyoutube.com/shorts/AbCdEfGhIj0",
      "김치볶음밥 레시피",
    ]) {
      expect(checkShortsUrl(input)).toEqual({ ok: false, reason: "unsupported" });
    }
  });
});
