import { describe, expect, it } from "vitest";
import { failureView, stageText } from "./job-display";

const demo = { loggedIn: false, canRetry: true, uploadReady: false };

describe("stageText", () => {
  it("단계마다 문구가 있다", () => {
    expect(stageText({ status: "running", stage: "collect" })).toBe("Getting the video…");
    expect(stageText({ status: "running", stage: "asr" })).toBe("Listening to the audio…");
    expect(stageText({ status: "running", stage: "ocr" })).toBe("Reading on-screen text & captions…");
    expect(stageText({ status: "running", stage: "structure" })).toBe("Writing the recipe…");
  });

  it("finalize는 따로 보여 주지 않고 '레시피 정리 중'을 유지한다", () => {
    expect(stageText({ status: "running", stage: "finalize" })).toBe("Writing the recipe…");
  });

  it("대기 중·단계 없음·모르는 단계는 '곧 시작해요'", () => {
    expect(stageText({ status: "queued", stage: null })).toBe("Starting soon…");
    expect(stageText({ status: "running", stage: null })).toBe("Starting soon…");
    expect(stageText({ status: "running", stage: "unknown" as never })).toBe("Starting soon…");
  });
});

describe("failureView", () => {
  it("문구표 7종을 reason·error_code로 고른다", () => {
    const v = (errorCode: string, reason: string | null, runId: string | null = null) =>
      failureView({ errorCode: errorCode as never, reason, runId }, demo);
    expect(v("retryable", "llm_transient").title).toBe("Something went wrong");
    expect(v("unavailable", "not_playable").title).toBe("We can't open this video");
    expect(v("unavailable", "no_captions_no_description").title).toBe("This video has no captions we can read");
    expect(v("insufficient", "no_captions").title).toBe("This video has no captions we can read");
    expect(v("not_a_recipe", "model_not_a_recipe").title).toBe("This doesn't look like a cooking video");
    expect(v("insufficient", "partial_recipe", "run-1").title).toBe("We only found part of the recipe");
    expect(v("insufficient", "empty_recipe").title).toBe("We couldn't find a recipe in this video");
    expect(v("internal", "unexpected").title).toBe("Something went wrong on our end");
  });

  it("데모(비로그인·업로드 없음)에서는 쓸 수 없는 버튼을 뺀다", () => {
    expect(failureView({ errorCode: "unavailable", reason: "not_playable", runId: null }, demo).actions).toEqual(["other_link"]);
    // [홈으로]는 로그인 전에도 둔다. 홈의 "만드는 중" 카드로 돌아올 수 있어서다(KAN-56)
    expect(failureView({ errorCode: "internal", reason: "unexpected", runId: null }, demo).actions).toEqual(["retry", "go_home"]);
    expect(failureView({ errorCode: "internal", reason: "unexpected", runId: null }, { ...demo, loggedIn: true }).actions).toEqual(["retry", "go_home"]);
  });

  it("링크를 모르면 다시 시도 대신 다른 링크만", () => {
    const view = failureView({ errorCode: "retryable", reason: null, runId: null }, { ...demo, canRetry: false });
    expect(view.actions).toEqual(["other_link"]);
  });

  it("찾은 만큼 보기는 결과(runId)가 있을 때만", () => {
    expect(failureView({ errorCode: "insufficient", reason: "partial_recipe", runId: "run-1" }, demo).actions).toEqual(["show_partial", "other_link"]);
    const noRun = failureView({ errorCode: "insufficient", reason: "partial_recipe", runId: null }, demo);
    expect(noRun.title).toBe("We couldn't find a recipe in this video");
    expect(noRun.actions).toEqual(["other_link"]);
  });

  it("모르는 error_code나 코드 없음은 일시 오류로", () => {
    expect(failureView({ errorCode: "brand_new" as never, reason: null, runId: null }, demo).title).toBe("Something went wrong");
    expect(failureView({ errorCode: null, reason: null, runId: null }, demo).title).toBe("Something went wrong");
  });
});
