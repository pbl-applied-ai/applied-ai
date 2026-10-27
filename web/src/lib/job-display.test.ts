import { describe, expect, it } from "vitest";
import { failureCopy, stageText } from "./job-display";

describe("stageText", () => {
  it("단계마다 문구가 있다", () => {
    expect(stageText({ status: "running", stage: "collect" })).toBe("영상 정보 가져오는 중…");
    expect(stageText({ status: "running", stage: "asr" })).toBe("음성 듣는 중…");
    expect(stageText({ status: "running", stage: "ocr" })).toBe("화면 글자 읽는 중…");
    expect(stageText({ status: "running", stage: "structure" })).toBe("레시피 정리 중…");
    expect(stageText({ status: "running", stage: "finalize" })).toBe("레시피 정리 중…");
  });

  it("대기 중이거나 단계가 없으면 '곧 시작해요'", () => {
    expect(stageText({ status: "queued", stage: null })).toBe("곧 시작해요…");
    expect(stageText({ status: "running", stage: null })).toBe("곧 시작해요…");
  });

  it("모르는 단계가 와도 빈 문구가 되지 않는다", () => {
    expect(stageText({ status: "running", stage: "upload" as never })).toBe("곧 시작해요…");
  });
});

describe("failureCopy", () => {
  it("error_code별 다음 행동", () => {
    expect(failureCopy({ errorCode: "retryable", runId: null }).actions).toEqual(["retry", "other_link"]);
    expect(failureCopy({ errorCode: "unavailable", runId: null }).actions).toEqual(["other_link"]);
    expect(failureCopy({ errorCode: "unsupported_source", runId: null }).actions).toEqual(["other_link"]);
    expect(failureCopy({ errorCode: "not_a_recipe", runId: null }).actions).toEqual(["other_link"]);
    expect(failureCopy({ errorCode: "internal", runId: null }).actions).toEqual(["retry", "other_link"]);
  });

  it("insufficient는 결과가 있을 때만 '찾은 만큼 보기'", () => {
    expect(failureCopy({ errorCode: "insufficient", runId: "run-1" }).actions).toEqual(["partial", "other_link"]);
    const empty = failureCopy({ errorCode: "insufficient", runId: null });
    expect(empty.actions).toEqual(["other_link"]);
    expect(empty.title).toBe("영상에서 레시피를 찾지 못했어요");
  });

  it("error_code가 없거나 모르는 코드면 일시 오류로 안내", () => {
    expect(failureCopy({ errorCode: null, runId: null }).title).toBe("잠시 문제가 생겼어요");
    const unknown = failureCopy({ errorCode: "schema_error" as never, runId: null });
    expect(unknown.title).toBe("잠시 문제가 생겼어요");
    expect(unknown.actions).toEqual(["retry", "other_link"]);
  });
});
