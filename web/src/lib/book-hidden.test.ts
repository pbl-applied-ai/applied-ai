import { beforeEach, describe, expect, it } from "vitest";
import { hideJob, readBookHidden, rememberSavedRun } from "./book-hidden";

beforeEach(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
});

describe("book-hidden", () => {
  it("저장·삭제한 시각을 남기고, 다시 부르면 최신 시각으로 바꾼다", () => {
    rememberSavedRun("u1", "run-a", 100);
    rememberSavedRun("u1", "run-a", 200);
    expect(readBookHidden("u1").runs.get("run-a")).toBe(200);
  });

  it("사용자마다 따로 남긴다", () => {
    rememberSavedRun("u1", "run-a", 100);
    hideJob("u1", "job-x");
    const other = readBookHidden("u2");
    expect(other.runs.size).toBe(0);
    expect(other.jobs.size).toBe(0);
    expect(readBookHidden("u1").jobs.has("job-x")).toBe(true);
  });
});
