import { describe, expect, it } from "vitest";
import { failureView, stageText } from "./job-display";

const demo = { loggedIn: false, canRetry: true, uploadReady: false };

describe("stageText", () => {
  it("단계마다 문구가 있다", () => {
    expect(stageText({ status: "running", stage: "collect" })).toBe("영상 정보 가져오는 중…");
    expect(stageText({ status: "running", stage: "asr" })).toBe("음성 듣는 중…");
    expect(stageText({ status: "running", stage: "ocr" })).toBe("화면 글자 읽는 중…");
    expect(stageText({ status: "running", stage: "structure" })).toBe("레시피 정리 중…");
  });

  it("finalize는 따로 보여 주지 않고 '레시피 정리 중'을 유지한다", () => {
    expect(stageText({ status: "running", stage: "finalize" })).toBe("레시피 정리 중…");
  });

  it("대기 중·단계 없음·모르는 단계는 '곧 시작해요'", () => {
    expect(stageText({ status: "queued", stage: null })).toBe("곧 시작해요…");
    expect(stageText({ status: "running", stage: null })).toBe("곧 시작해요…");
    expect(stageText({ status: "running", stage: "unknown" as never })).toBe("곧 시작해요…");
  });
});

describe("failureView", () => {
  it("문구표 7종을 reason·error_code로 고른다", () => {
    const v = (errorCode: string, reason: string | null, runId: string | null = null) =>
      failureView({ errorCode: errorCode as never, reason, runId }, demo);
    expect(v("retryable", "llm_transient").title).toBe("잠시 문제가 생겼어요");
    expect(v("unavailable", "not_playable").title).toBe("이 영상은 열 수 없어요");
    expect(v("unavailable", "no_captions_no_description").title).toBe("이 영상은 자막이 없어서 읽을 수 없어요");
    expect(v("insufficient", "no_captions").title).toBe("이 영상은 자막이 없어서 읽을 수 없어요");
    expect(v("not_a_recipe", "model_not_a_recipe").title).toBe("요리 영상이 아닌 것 같아요");
    expect(v("insufficient", "partial_recipe", "run-1").title).toBe("영상에서 찾은 정보가 적어요");
    expect(v("insufficient", "empty_recipe").title).toBe("영상에서 레시피를 찾지 못했어요");
    expect(v("internal", "unexpected").title).toBe("서비스에 문제가 생겼어요");
  });

  it("데모(비로그인·업로드 없음)에서는 쓸 수 없는 버튼을 뺀다", () => {
    expect(failureView({ errorCode: "unavailable", reason: "not_playable", runId: null }, demo).actions).toEqual(["other_link"]);
    expect(failureView({ errorCode: "internal", reason: "unexpected", runId: null }, demo).actions).toEqual(["retry", "other_link"]);
    expect(failureView({ errorCode: "internal", reason: "unexpected", runId: null }, { ...demo, loggedIn: true }).actions).toEqual(["retry", "go_book"]);
  });

  it("링크를 모르면 다시 시도 대신 다른 링크만", () => {
    const view = failureView({ errorCode: "retryable", reason: null, runId: null }, { ...demo, canRetry: false });
    expect(view.actions).toEqual(["other_link"]);
  });

  it("찾은 만큼 보기는 결과(runId)가 있을 때만", () => {
    expect(failureView({ errorCode: "insufficient", reason: "partial_recipe", runId: "run-1" }, demo).actions).toEqual(["show_partial", "other_link"]);
    expect(failureView({ errorCode: "insufficient", reason: "partial_recipe", runId: null }, demo).actions).toEqual(["other_link"]);
  });

  it("모르는 error_code나 코드 없음은 일시 오류로", () => {
    expect(failureView({ errorCode: "brand_new" as never, reason: null, runId: null }, demo).title).toBe("잠시 문제가 생겼어요");
    expect(failureView({ errorCode: null, reason: null, runId: null }, demo).title).toBe("잠시 문제가 생겼어요");
  });
});
