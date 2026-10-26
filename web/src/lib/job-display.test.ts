import { describe, expect, it } from "vitest";
import { failureCopy, stageText } from "./job-display";

describe("stageText", () => {
  it("단계마다 문구가 있다", () => {
    expect(stageText({ status: "processing", stage: "collect" })).toBe("영상 정보 가져오는 중…");
    expect(stageText({ status: "processing", stage: "asr" })).toBe("음성 듣는 중…");
    expect(stageText({ status: "processing", stage: "ocr" })).toBe("화면 글자 읽는 중…");
    expect(stageText({ status: "processing", stage: "structure" })).toBe("레시피 정리 중…");
  });

  it("대기 중이거나 단계가 없으면 '곧 시작해요'", () => {
    expect(stageText({ status: "queued", stage: null })).toBe("곧 시작해요…");
    expect(stageText({ status: "processing", stage: null })).toBe("곧 시작해요…");
  });

  it("모르는 단계가 와도 빈 문구가 되지 않는다", () => {
    expect(stageText({ status: "processing", stage: "finalize" as never })).toBe("곧 시작해요…");
  });
});

describe("failureCopy", () => {
  it("error_code별 다음 행동", () => {
    expect(failureCopy({ error_code: "retryable", run_id: null }).actions).toEqual(["retry", "other_link"]);
    expect(failureCopy({ error_code: "unavailable", run_id: null }).actions).toEqual(["other_link"]);
    expect(failureCopy({ error_code: "unsupported_source", run_id: null }).actions).toEqual(["other_link"]);
    expect(failureCopy({ error_code: "not_a_recipe", run_id: null }).actions).toEqual(["other_link"]);
    expect(failureCopy({ error_code: "schema_error", run_id: null }).actions).toEqual(["retry", "other_link"]);
  });

  it("insufficient는 결과가 있을 때만 '찾은 만큼 보기'", () => {
    expect(failureCopy({ error_code: "insufficient", run_id: "run-1" }).actions).toEqual(["partial", "other_link"]);
    const empty = failureCopy({ error_code: "insufficient", run_id: null });
    expect(empty.actions).toEqual(["other_link"]);
    expect(empty.title).toBe("영상에서 레시피를 찾지 못했어요");
  });

  it("error_code가 없거나 모르는 코드면 일시 오류로 안내", () => {
    expect(failureCopy({ error_code: null, run_id: null }).title).toBe("잠시 문제가 생겼어요");
    const unknown = failureCopy({ error_code: "internal" as never, run_id: null });
    expect(unknown.title).toBe("잠시 문제가 생겼어요");
    expect(unknown.actions).toEqual(["retry", "other_link"]);
  });
});
