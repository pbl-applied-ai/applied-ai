import { describe, expect, it } from 'vitest';
import { createMockApi } from './mock';
import { createSupabaseApi } from './supabase';
import type { EditableRecipe } from './types';
import { SAMPLE_RECIPE } from './fixtures';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';

function memoryStorage() {
  const data: Record<string, string> = {};
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] };
}

// PostgREST처럼 rpc 이름별로 응답한다. 보낸 요청은 sent에 쌓인다.
function fakeSupabase(replies: Record<string, { status?: number; body: unknown }>) {
  const sent: { name: string; args: unknown; apikey: string | null }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const name = String(url).split('/rpc/')[1];
    const headers = new Headers(init?.headers);
    sent.push({ name, args: JSON.parse(String(init?.body)), apikey: headers.get('apikey') });
    const reply = replies[name] ?? { body: null };
    const status = reply.status ?? 200;
    return new Response(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body), { status });
  }) as typeof fetch;
  return { sent, fetchImpl };
}

function setup(replies: Record<string, { status?: number; body: unknown }>) {
  const fake = fakeSupabase(replies);
  const storage = memoryStorage();
  const base = createMockApi({ latencyMs: 0, storage, navigate: () => {} });
  const api = createSupabaseApi(base, { url: 'https://demo.supabase.co/', anonKey: 'anon-key', fetchImpl: fake.fetchImpl, storage });
  return { api, sent: fake.sent };
}

describe('createSupabaseApi', () => {
  it('home recommendations come from list_featured as one "Trending now" group, in order (#63)', async () => {
    const rows = [
      { run_id: RUN_ID, title: 'No Blender Salsa', creator: 'Sample Chef', ingredient_count: 7, step_count: 8 },
      { run_id: JOB_ID, title: ' ', creator: null, ingredient_count: null, step_count: 0 },
    ];
    const { api, sent } = setup({ list_featured: { body: rows } });
    expect(await api.listRecommendations()).toEqual([
      {
        id: 'trending',
        title: 'Trending now',
        cards: [
          { runId: RUN_ID, title: 'No Blender Salsa', creator: 'Sample Chef', ingredientCount: 7 },
          { runId: JOB_ID, title: 'Untitled recipe', creator: '', ingredientCount: 0 },
        ],
      },
    ]);
    expect(sent).toEqual([{ name: 'list_featured', args: {}, apikey: 'anon-key' }]);
  });

  it('until featured runs are added, an empty or failing list_featured shows the mock groups (temporary, 11/18)', async () => {
    const mock = await createMockApi({ latencyMs: 0, storage: memoryStorage(), navigate: () => {} }).listRecommendations();
    expect(await setup({ list_featured: { body: [] } }).api.listRecommendations()).toEqual(mock);
    expect(await setup({ list_featured: { status: 404, body: 'missing' } }).api.listRecommendations()).toEqual(mock);
  });

  it('a mock recommendation card opens the mock result without calling get_run (temporary, 11/18)', async () => {
    const { api, sent } = setup({});
    const run = await api.getRun('run-MockReco001');
    expect(run?.recipe.title).toBeTruthy();
    expect(sent).toHaveLength(0);
  });

  it('creates a job with the anon key and returns its id', async () => {
    // PostgREST는 uuid 하나를 JSON 문자열("…")로 돌려준다
    const { api, sent } = setup({ create_job: { body: JSON.stringify(JOB_ID) } });
    expect(await api.createJob(' https://www.youtube.com/shorts/Smpl0Gochu1 ')).toEqual({ jobId: JOB_ID });
    expect(sent).toEqual([{ name: 'create_job', args: { p_source_url: 'https://www.youtube.com/shorts/Smpl0Gochu1' }, apikey: 'anon-key' }]);
  });

  it('maps a get_job row to the screen Job', async () => {
    const row = { id: JOB_ID, status: 'failed', stage: 'finalize', error_code: 'not_a_recipe', reason: 'model_not_a_recipe', run_id: null, created_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:05Z' };
    const { api } = setup({ get_job: { body: [row] } });
    expect(await api.getJob(JOB_ID)).toEqual({
      id: JOB_ID, sourceUrl: '', status: 'failed', stage: 'finalize', errorCode: 'not_a_recipe', reason: 'model_not_a_recipe', runId: null, createdAt: '2026-10-29T00:00:00Z',
    });
  });

  it('returns null for a missing job or a non-uuid id instead of throwing', async () => {
    expect(await setup({ get_job: { body: [] } }).api.getJob(JOB_ID)).toBeNull();
    const notUuid = { status: 400, body: '{"code":"22P02","message":"invalid input syntax for type uuid"}' };
    expect(await setup({ get_run: notUuid }).api.getRun('run-Smpl0Gochu1')).toBeNull();
  });

  it('reports other RPC errors', async () => {
    const { api } = setup({ create_job: { status: 400, body: '{"code":"22023","message":"invalid source_url"}' } });
    await expect(api.createJob('ftp://x')).rejects.toThrow(/rpc create_job 400: .*invalid source_url/);
  });

  it('reads a run and fills the source link of a recipe saved through the mock book', async () => {
    const run = { id: RUN_ID, source_url: 'https://www.youtube.com/shorts/Smpl0Gochu1', recipe: SAMPLE_RECIPE, partial: false, created_at: '2026-10-29T00:00:00Z' };
    const { api } = setup({ get_run: { body: [run] } });
    expect(await api.getRun(RUN_ID)).toEqual({ id: RUN_ID, sourceUrl: run.source_url, recipe: SAMPLE_RECIPE, createdAt: run.created_at });

    await api.signInWithGoogle('/');
    const draft: EditableRecipe = { runId: RUN_ID, title: 't', servingsRaw: null, ingredients: [], steps: [] };
    const { id } = await api.saveRecipe(draft);
    expect((await api.getRecipe(id))?.sourceUrl).toBe(run.source_url);
  });
});
