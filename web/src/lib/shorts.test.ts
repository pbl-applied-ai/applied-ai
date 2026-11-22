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
        platform: "youtube",
        videoId: "AbCdEfGhIj0",
        url: "https://www.youtube.com/shorts/AbCdEfGhIj0",
      });
    }
  });

  it("Instagram 릴스·게시물 링크를 받고 추적용 값을 떼서 /reel/<code>/로 맞춘다(KAN-62)", () => {
    for (const input of [
      "https://www.instagram.com/reel/C_Du3v8KCBC/?cnvx=M2VxdzMxNGo1emp5",
      "https://instagram.com/reels/C_Du3v8KCBC",
      "instagram.com/p/C_Du3v8KCBC/?igsh=abc",
      "https://m.instagram.com/bienbento/reel/C_Du3v8KCBC/",
    ]) {
      expect(checkShortsUrl(input)).toEqual({
        ok: true,
        platform: "instagram",
        videoId: "C_Du3v8KCBC",
        url: "https://www.instagram.com/reel/C_Du3v8KCBC/",
      });
    }
  });

  it("빈 입력은 empty", () => {
    expect(checkShortsUrl("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("Shorts가 아닌 YouTube 링크, 릴스가 아닌 Instagram 주소, 주소가 아닌 글(형식 오류)은 not_shorts", () => {
    for (const input of [
      "https://www.youtube.com/watch?v=AbCdEfGhIj0",
      "https://youtu.be/AbCdEfGhIj0",
      "https://www.youtube.com/shorts/",
      "https://www.youtube.com/shorts/short",
      "https://www.instagram.com/bienbento/",
      "https://www.instagram.com/reel/abc/",
      "김치볶음밥 레시피",
      "hello",
      "y",
    ]) {
      expect(checkShortsUrl(input)).toEqual({ ok: false, reason: "not_shorts" });
    }
  });

  it("다른 서비스 링크는 unsupported", () => {
    for (const input of [
      "https://www.tiktok.com/@user/video/123",
      "https://notyoutube.com/shorts/AbCdEfGhIj0",
      "https://notinstagram.com/reel/C_Du3v8KCBC/",
    ]) {
      expect(checkShortsUrl(input)).toEqual({ ok: false, reason: "unsupported" });
    }
  });
});
