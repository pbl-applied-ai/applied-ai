import { describe, expect, it } from "vitest";
import { MAX_RECENT_JOBS, RECENT_JOB_TTL_MS, forgetRecentJob, recentJobIds, rememberRecentJob } from "./recent-jobs";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("이 브라우저에서 만든 작업 (KAN-56·74)", () => {
  it("최근 것부터, 같은 작업은 한 번만", () => {
    const s = memoryStorage();
    rememberRecentJob("a", 1, s);
    rememberRecentJob("b", 2, s);
    rememberRecentJob("a", 3, s);
    expect(recentJobIds(10, s)).toEqual(["a", "b"]);
  });

  it(`${MAX_RECENT_JOBS}개까지만 기억한다`, () => {
    const s = memoryStorage();
    for (let i = 0; i < MAX_RECENT_JOBS + 2; i++) rememberRecentJob(`job-${i}`, i, s);
    const ids = recentJobIds(100, s);
    expect(ids).toHaveLength(MAX_RECENT_JOBS);
    expect(ids[0]).toBe(`job-${MAX_RECENT_JOBS + 1}`);
    expect(ids).not.toContain("job-0");
  });

  it("7일 지난 작업은 빼고, 저장소가 깨졌거나 없으면 빈 목록", () => {
    const s = memoryStorage();
    rememberRecentJob("old", 0, s);
    rememberRecentJob("new", RECENT_JOB_TTL_MS, s);
    expect(recentJobIds(RECENT_JOB_TTL_MS + 1, s)).toEqual(["new"]);

    s.setItem("recent-jobs-v1", "{깨짐");
    expect(recentJobIds(0, s)).toEqual([]);
    expect(recentJobIds(0, null)).toEqual([]);
    expect(() => rememberRecentJob("x", 0, null)).not.toThrow();
  });

  it("7일 동안 남는다", () => {
    expect(RECENT_JOB_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("결과를 연 작업은 뺀다. 없는 작업·저장소 없음은 그냥 넘어간다", () => {
    const s = memoryStorage();
    rememberRecentJob("a", 1, s);
    rememberRecentJob("b", 2, s);
    forgetRecentJob("a", s);
    expect(recentJobIds(10, s)).toEqual(["b"]);
    forgetRecentJob("nope", s);
    expect(recentJobIds(10, s)).toEqual(["b"]);
    expect(() => forgetRecentJob("b", null)).not.toThrow();
  });
});
