import { describe, expect, it } from "vitest";
import { FAIL_GUIDE, failGuide } from "./labels";

describe("failGuide — Instagram (KAN-62, docs/ux-flow.md S3)", () => {
  it("삭제·비공개 릴스는 YouTube 비공개 영상과 같은 안내", () => {
    expect(failGuide({ errorCode: "unavailable", reason: "ig_not_found" })).toBe(FAIL_GUIDE.not_playable);
    expect(failGuide({ errorCode: "unavailable", reason: "ig_blocked" })).toBe(FAIL_GUIDE.not_playable);
  });

  it("사진 게시물과 근거 없는 릴스는 [다른 링크]가 먼저", () => {
    expect(failGuide({ errorCode: "unsupported_source", reason: "ig_not_video" }).actions[0]).toBe("other_link");
    expect(failGuide({ errorCode: "unavailable", reason: "no_media_no_caption" }).actions[0]).toBe("other_link");
  });

  it("업체 장애가 계속되면 영상 탓이 아닌 Instagram 안내, 크레딧·키 문제는 원인을 말하지 않는다", () => {
    expect(failGuide({ errorCode: "retryable", reason: "vendor_transient" }).title).toMatch(/Instagram/);
    expect(failGuide({ errorCode: "internal", reason: "vendor_quota" })).toBe(FAIL_GUIDE.internal);
    expect(failGuide({ errorCode: "internal", reason: "vendor_config" })).toBe(FAIL_GUIDE.internal);
  });

  it("지원 안 하는 서비스 안내에 릴스도 들어 있다", () => {
    expect(failGuide({ errorCode: "unsupported_source", reason: "not_youtube" }).body).toMatch(/Instagram Reels/);
  });
});
