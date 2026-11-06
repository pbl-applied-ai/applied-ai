// 실제 로그인·레시피북 연결(KAN-23·24). 네트워크는 가짜다.
import { describe, expect, it } from 'vitest';
import { createMockApi } from './mock';
import { createSupabaseApi } from './supabase';
import { type EditableRecipe, NotSignedInError } from './types';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const RECIPE_ID = '33333333-3333-4333-8333-333333333333';

function memoryStorage() {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

const tokenReply = (access: string, refresh = `${access}-refresh`) => ({
  access_token: access,
  refresh_token: refresh,
  expires_in: 3600,
  user: { id: 'user-1', email: 'a@example.com' },
});

type Reply = { status?: number; body?: unknown } | (() => never);

// 주소의 앞부분으로 답을 고른다. 보낸 요청은 sent에 쌓인다.
function setup(replies: Record<string, Reply> = {}, { recipeBook = true } = {}) {
  const sent: { url: string; method: string; authorization: string | null; body: unknown }[] = [];
  const navigated: string[] = [];
  const storage = memoryStorage();
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace('https://demo.supabase.co', '');
    sent.push({
      url: path,
      method: init?.method ?? 'GET',
      authorization: new Headers(init?.headers).get('authorization'),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const key = Object.keys(replies).find((k) => path.startsWith(k));
    const reply = key ? replies[key] : { body: null };
    if (typeof reply === 'function') reply();
    const { status = 200, body = null } = reply as { status?: number; body?: unknown };
    return new Response(body === null ? '' : JSON.stringify(body), { status });
  }) as typeof fetch;
  const api = createSupabaseApi(createMockApi({ latencyMs: 0, storage, navigate: () => {} }), {
    url: 'https://demo.supabase.co/',
    anonKey: 'anon-key',
    fetchImpl,
    storage,
    recipeBook,
    navigate: (to) => navigated.push(to),
    origin: 'https://site.example',
  });
  return { api, sent, navigated, storage };
}

async function signedIn(replies: Record<string, Reply> = {}) {
  const ctx = setup({ '/auth/v1/token?grant_type=pkce': { body: tokenReply('tok') }, ...replies });
  await ctx.api.signInWithGoogle('/r/abc');
  await ctx.api.completeSignIn('the-code');
  ctx.sent.length = 0;
  return ctx;
}

const draft: EditableRecipe = {
  runId: RUN_ID,
  title: '덮밥',
  servingsRaw: null,
  ingredients: [{ id: 'ing-1', name: '고추장', amount_raw: '2큰술', amount_status: 'confirmed', edited: false, user_entered: false }],
  steps: [{ id: 'step-1', text: '볶는다', edited: false, user_entered: false }],
};

describe('sign-in', () => {
  it('goes to Google with a PKCE challenge and comes back to /auth/callback', async () => {
    const { api, navigated, storage } = setup();
    await api.signInWithGoogle('/r/abc');
    const url = new URL(navigated[0]);
    expect(url.origin + url.pathname).toBe('https://demo.supabase.co/auth/v1/authorize');
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe('https://site.example/auth/callback');
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
    const pending = JSON.parse(storage.data['supabase-signin-v1']);
    expect(url.searchParams.get('code_challenge')).not.toBe(pending.verifier);
    expect(pending.next).toBe('/r/abc');
  });

  it('trades the code for a session and returns where to go', async () => {
    const ctx = setup({ '/auth/v1/token?grant_type=pkce': { body: tokenReply('tok') } });
    await ctx.api.signInWithGoogle('/r/abc');
    const { verifier } = JSON.parse(ctx.storage.data['supabase-signin-v1']);
    expect(await ctx.api.completeSignIn('the-code')).toBe('/r/abc');
    expect(ctx.sent.at(-1)?.body).toEqual({ auth_code: 'the-code', code_verifier: verifier });
    expect(await ctx.api.getUser()).toEqual({ id: 'user-1', email: 'a@example.com' });
    expect(ctx.storage.data['supabase-signin-v1']).toBeUndefined();
  });

  it('refuses a code when sign-in did not start in this browser or the server rejects it', async () => {
    await expect(setup().api.completeSignIn('x')).rejects.toThrow(/not started/);
    const ctx = setup({ '/auth/v1/token?grant_type=pkce': { status: 400, body: { error: 'bad' } } });
    await ctx.api.signInWithGoogle('/');
    await expect(ctx.api.completeSignIn('x')).rejects.toThrow(/sign-in 400/);
    expect(await ctx.api.getUser()).toBeNull();
  });

  it('is signed out with nothing stored, and sign-out clears the session', async () => {
    expect(await setup().api.getUser()).toBeNull();
    const ctx = await signedIn();
    await ctx.api.signOut();
    expect(ctx.sent[0]).toMatchObject({ url: '/auth/v1/logout', authorization: 'Bearer tok' });
    expect(await ctx.api.getUser()).toBeNull();
  });
});

describe('session refresh', () => {
  function expire(storage: ReturnType<typeof memoryStorage>) {
    const session = JSON.parse(storage.data['supabase-session-v1']);
    storage.data['supabase-session-v1'] = JSON.stringify({ ...session, expiresAt: Date.now() - 1000 });
  }

  it('gets a new token once when it is about to end, even with calls at the same time', async () => {
    const ctx = await signedIn({ '/auth/v1/token?grant_type=refresh_token': { body: tokenReply('new') }, '/rest/v1/user_recipes': { body: [] } });
    expire(ctx.storage);
    await Promise.all([ctx.api.listRecipes(), ctx.api.getUser()]);
    expect(ctx.sent.filter((s) => s.url.includes('refresh_token'))).toHaveLength(1);
    expect(ctx.sent.find((s) => s.url.startsWith('/rest/'))?.authorization).toBe('Bearer new');
  });

  it('signs out when the refresh token is finished', async () => {
    const ctx = await signedIn({ '/auth/v1/token?grant_type=refresh_token': { status: 400, body: {} } });
    expire(ctx.storage);
    expect(await ctx.api.getUser()).toBeNull();
    expect(ctx.storage.data['supabase-session-v1']).toBeUndefined();
  });

  it('keeps the session through a network failure', async () => {
    const ctx = await signedIn({
      '/auth/v1/token?grant_type=refresh_token': () => {
        throw new TypeError('fetch failed');
      },
    });
    expire(ctx.storage);
    expect(await ctx.api.getUser()).toBeNull();
    expect(ctx.storage.data['supabase-session-v1']).toBeDefined();
  });
});

describe('recipe book', () => {
  it('needs sign-in without calling the server', async () => {
    const { api, sent } = setup();
    await expect(api.saveRecipe(draft)).rejects.toBeInstanceOf(NotSignedInError);
    await expect(api.listRecipes()).rejects.toBeInstanceOf(NotSignedInError);
    await expect(api.listMyJobs()).rejects.toBeInstanceOf(NotSignedInError);
    expect(sent).toEqual([]);
  });

  it('sends the sign-in token when creating a job, so it shows in my book', async () => {
    const ctx = await signedIn({ '/rest/v1/rpc/create_job': { body: 'job-1' } });
    await ctx.api.createJob('https://www.youtube.com/shorts/Smpl0Gochu1');
    expect(ctx.sent[0].authorization).toBe('Bearer tok');
    const anon = setup({ '/rest/v1/rpc/create_job': { body: 'job-1' } });
    await anon.api.createJob('https://www.youtube.com/shorts/Smpl0Gochu1');
    expect(anon.sent[0].authorization).toBe('Bearer anon-key');
  });

  it('saves and updates through the RPCs', async () => {
    const ctx = await signedIn({ '/rest/v1/rpc/save_recipe': { body: RECIPE_ID } });
    expect(await ctx.api.saveRecipe(draft)).toEqual({ id: RECIPE_ID });
    expect(ctx.sent[0]).toMatchObject({
      url: '/rest/v1/rpc/save_recipe',
      authorization: 'Bearer tok',
      body: { p_run_id: RUN_ID, p_title: '덮밥', p_servings_raw: null, p_ingredients: draft.ingredients, p_steps: draft.steps },
    });
    await ctx.api.updateRecipe(RECIPE_ID, draft);
    expect(ctx.sent[1]).toMatchObject({ url: '/rest/v1/rpc/update_recipe', body: { p_id: RECIPE_ID, p_title: '덮밥' } });
  });

  it('lists recipes as cards with the count of missing amounts', async () => {
    const ingredients = [draft.ingredients[0], { ...draft.ingredients[0], id: 'ing-2', amount_raw: null }];
    const row = { id: RECIPE_ID, run_id: RUN_ID, title: '덮밥', ingredients, created_at: '2026-11-06T00:00:00Z' };
    const ctx = await signedIn({ '/rest/v1/user_recipes': { body: [row] } });
    expect(await ctx.api.listRecipes()).toEqual([
      { id: RECIPE_ID, runId: RUN_ID, title: '덮밥', ingredientCount: 2, unconfirmedCount: 1, createdAt: row.created_at },
    ]);
  });

  it('maps a recipe, and hides the link of an uploaded video', async () => {
    const row = {
      id: RECIPE_ID, run_id: RUN_ID, source_url: 'upload:abc', title: '덮밥', servings_raw: '2인분',
      ingredients: draft.ingredients, steps: draft.steps, created_at: 'c', updated_at: 'u',
    };
    const ctx = await signedIn({ '/rest/v1/rpc/get_recipe': { body: [row] } });
    expect(await ctx.api.getRecipe(RECIPE_ID)).toEqual({
      id: RECIPE_ID, runId: RUN_ID, sourceUrl: '', title: '덮밥', servingsRaw: '2인분',
      ingredients: draft.ingredients, steps: draft.steps, createdAt: 'c', updatedAt: 'u',
    });
    const none = await signedIn({ '/rest/v1/rpc/get_recipe': { body: [] } });
    expect(await none.api.getRecipe(RECIPE_ID)).toBeNull();
  });

  it('reads my jobs and deletes a recipe by its id', async () => {
    const job = { id: 'j', source_url: 'https://a', status: 'queued', stage: null, error_code: null, reason: null, run_id: null, created_at: 'c' };
    const ctx = await signedIn({ '/rest/v1/jobs': { body: [job] } });
    expect((await ctx.api.listMyJobs())[0]).toMatchObject({ id: 'j', sourceUrl: 'https://a', status: 'queued' });
    await ctx.api.deleteRecipe(RECIPE_ID);
    expect(ctx.sent[1]).toMatchObject({ url: `/rest/v1/user_recipes?id=eq.${RECIPE_ID}`, method: 'DELETE', authorization: 'Bearer tok' });
  });

  it('treats a rejected token as signed out and reports other errors', async () => {
    const denied = await signedIn({ '/rest/v1/rpc/save_recipe': { status: 401, body: {} }, '/rest/v1/user_recipes': { status: 401, body: {} } });
    await expect(denied.api.saveRecipe(draft)).rejects.toBeInstanceOf(NotSignedInError);
    await expect(denied.api.listRecipes()).rejects.toBeInstanceOf(NotSignedInError);
    const broken = await signedIn({ '/rest/v1/rpc/save_recipe': { status: 400, body: { code: '22023' } } });
    await expect(broken.api.saveRecipe(draft)).rejects.toThrow(/rpc save_recipe 400/);
  });
});

describe('with the recipe book off', () => {
  it('keeps the mock book and never calls Supabase Auth', async () => {
    const { api, sent, navigated } = setup({}, { recipeBook: false });
    await api.signInWithGoogle('/');
    expect(navigated).toEqual([]);
    expect(await api.getUser()).toMatchObject({ id: 'mock-user' });
    const { id } = await api.saveRecipe(draft);
    expect((await api.getRecipe(id))?.title).toBe('덮밥');
    expect(sent).toEqual([]);
  });
});
