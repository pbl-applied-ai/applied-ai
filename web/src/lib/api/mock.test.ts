import { describe, expect, it } from "vitest";
import { toEditable } from "./editable";
import { MOCK_LINKS, createMockApi } from "./mock";
import { DailyLimitError } from "./types";

function setup() {
  let t = Date.parse("2026-10-26T00:00:00Z");
  const api = createMockApi({ now: () => t, latencyMs: 0, storage: null, navigate: () => {} });
  return { api, advance: (ms: number) => (t += ms) };
}

describe("createMockApi", () => {
  it("시간에 따라 queued → collect → structure → succeeded", async () => {
    const { api, advance } = setup();
    const { jobId } = await api.createJob(MOCK_LINKS.success);
    expect((await api.getJob(jobId))?.status).toBe("queued");
    advance(1000);
    expect((await api.getJob(jobId))?.stage).toBe("collect");
    advance(2000);
    expect((await api.getJob(jobId))?.stage).toBe("structure");
    advance(3000);
    const done = await api.getJob(jobId);
    expect(done?.status).toBe("succeeded");
    expect(done?.runId).toBeTruthy();
    expect(await api.getRun(done!.runId!)).not.toBeNull();
  });

  it("실패용 링크는 error_code·reason으로 끝나고, partial_recipe만 결과를 준다", async () => {
    const { api, advance } = setup();
    const notRecipe = await api.createJob(MOCK_LINKS.notARecipe);
    const partial = await api.createJob(MOCK_LINKS.partialRecipe);
    advance(6000);
    const a = await api.getJob(notRecipe.jobId);
    expect([a?.status, a?.errorCode, a?.runId]).toEqual(["failed", "not_a_recipe", null]);
    const b = await api.getJob(partial.jobId);
    expect([b?.status, b?.errorCode, b?.reason]).toEqual(["failed", "insufficient", "partial_recipe"]);
    expect(b?.runId).toBeTruthy();
  });

  it("추정값은 로그인했을 때만 오고, 저장한 레시피에는 남지 않는다(KAN-66)", async () => {
    const { api } = setup();
    const runId = "run-Smpl0Gochu1";
    const before = await api.getRun(runId);
    expect(before!.recipe.ingredients.some((i) => i.amount_estimate)).toBe(false);
    // 로그인 전: 추정값이 있는 재료에만 has_estimate(잠금 배지), 없는 재료에는 없다(#70 리뷰)
    const guest = toEditable(before!).ingredients;
    expect(guest.find((i) => i.name === "Garlic")?.has_estimate).toBe(true);
    expect(guest.filter((i) => !i.amount_raw && !i.has_estimate).length).toBeGreaterThan(0);
    expect(guest.filter((i) => i.amount_raw).every((i) => !i.has_estimate)).toBe(true);

    await api.signInWithGoogle("/");
    const after = await api.getRun(runId);
    const garlic = after!.recipe.ingredients.find((i) => i.name === "Garlic");
    expect(garlic?.amount_estimate?.text).toBeTruthy();
    expect(after!.recipe.ingredients.find((i) => i.amount_raw)?.amount_estimate).toBeUndefined();

    await api.saveRecipe(toEditable(after!));
    const [card] = await api.listRecipes();
    const saved = await api.getRecipe(card.id);
    expect(saved!.ingredients.some((i) => "amount_estimate" in i)).toBe(false);
    expect(saved!.ingredients.some((i) => "has_estimate" in i)).toBe(false);
  });

  it("폴더를 만들고 레시피를 넣으면 목록·개수에 나온다(11/24)", async () => {
    const { api } = setup();
    await api.signInWithGoogle("/");
    const run = await api.getRun("run-Smpl0Gochu1");
    const { id } = await api.saveRecipe(toEditable(run!));
    const pasta = await api.createFolder("Pasta");
    await expect(api.createFolder(" pasta ")).rejects.toMatchObject({ reason: "duplicate" });
    await expect(api.createFolder("  ")).rejects.toMatchObject({ reason: "invalid" });
    await api.setRecipeFolders(id, [pasta.id, pasta.id]);
    expect((await api.listFolders()).map((f) => [f.name, f.recipeCount])).toEqual([["Pasta", 1]]);
    expect((await api.listRecipes())[0].categoryIds).toEqual([pasta.id]);
    await api.setRecipeFolders(id, []);
    expect((await api.listFolders())[0].recipeCount).toBe(0);
  });

  it("Shorts가 아닌 YouTube 링크는 unsupported_source", async () => {
    const { api, advance } = setup();
    const { jobId } = await api.createJob("https://www.youtube.com/watch?v=AbCdEfGhIj0");
    advance(6000);
    expect((await api.getJob(jobId))?.errorCode).toBe("unsupported_source");
  });

  it("없는 job은 null", async () => {
    const { api } = setup();
    expect(await api.getJob("nope")).toBeNull();
  });

  it("홈 추천 묶음 목업은 로그인 없이 열리고, 카드는 공개 보기로 열 수 있다 (KAN-56)", async () => {
    const { api } = setup();
    const groups = await api.listRecommendations();
    expect(groups.length).toBeGreaterThan(0);
    for (const card of groups.flatMap((g) => g.cards)) {
      expect(card.creator).toBeTruthy();
      expect(await api.getRun(card.runId)).not.toBeNull();
    }
  });

  it("로그인하면 하루 10개까지, 다음 날(한국 시간)이면 다시", async () => {
    const { api, advance } = setup();
    expect(await api.getQuota()).toBeNull();
    await api.signInWithGoogle("/");
    for (let i = 0; i < 10; i++) await api.createJob(MOCK_LINKS.success);
    expect(await api.getQuota()).toEqual({ used: 10, limit: 10 });
    await expect(api.createJob(MOCK_LINKS.success)).rejects.toBeInstanceOf(DailyLimitError);
    advance(24 * 60 * 60 * 1000);
    expect(await api.getQuota()).toEqual({ used: 0, limit: 10 });
    await expect(api.createJob(MOCK_LINKS.success)).resolves.toBeTruthy();
  });
});
