import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalKey, extractorVersion, isDevVersion, runJob } from '../src/job.mjs';
import { processJob, supabaseRpc } from '../src/worker.mjs';

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const llmFixture = JSON.parse(readFileSync(fixture('sample-gochujang-bowl.llm.json'), 'utf8'));
const URL_OK = 'https://www.youtube.com/shorts/Smpl0Gochu1';
const NO_KEY = {};
const OPENAI = { OPENAI_API_KEY: 'test-key' };

// Runs the job on the sample transcript, with the model output changed by edit.
const sampleJob = (edit = (llm) => llm, opts = {}) =>
  runJob({ source_url: URL_OK }, {
    transcriptFile: fixture('sample-gochujang-bowl.transcript.json'),
    llmOutput: edit(structuredClone(llmFixture)),
    env: NO_KEY,
    ...opts,
  });

// Fake YouTube: player is called per client; caption replies come from captionStatus in order.
const youtube = ({ playability = 'OK', tracks = true, description = '', captionStatus = [200, 200], playerStatus = 200, throwOn } = {}) => {
  let caption = 0;
  return async (url) => {
    if (throwOn && url.includes(throwOn)) throw new TypeError('fetch failed');
    if (url.includes('/player')) {
      return {
        ok: playerStatus === 200,
        status: playerStatus,
        json: async () => ({
          playabilityStatus: { status: playability },
          videoDetails: { title: 't', author: 'a', lengthSeconds: '10', shortDescription: description },
          ...(tracks && { captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'ko', kind: 'asr', baseUrl: 'https://example.test/caption' }] } } }),
        }),
      };
    }
    if (url.includes('example.test/caption')) {
      const status = captionStatus[caption++];
      return { ok: status === 200, status, text: async () => (status === 200 ? '<transcript><text start="1" dur="2">계란</text></transcript>' : 'x') };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
};

const failure = (out) => ({ stage: out.stage, error_code: out.error_code, reason: out.reason, retry: out.retry });

test('canonicalKey is the video ID for every YouTube link shape, null otherwise', () => {
  for (const u of [URL_OK, 'https://youtu.be/Smpl0Gochu1', ' https://www.youtube.com/watch?v=Smpl0Gochu1&t=3s ']) {
    assert.equal(canonicalKey(u), 'youtube:Smpl0Gochu1', u);
  }
  assert.equal(canonicalKey('https://www.instagram.com/reel/abc/'), null);
  assert.equal(canonicalKey(undefined), null);
});

test('extractorVersion uses the pipeline tree hash, or +dev without it', () => {
  const v = extractorVersion({ ...OPENAI, PIPELINE_TREE: '9b1e04d5c0ffee' });
  assert.match(v.pipeline, /^\d+\.\d+\.\d+\+9b1e04d$/);
  assert.equal(v.model, 'openai:gpt-4.1');
  assert.equal(isDevVersion(v), false);
  const dev = extractorVersion(NO_KEY);
  assert.equal(isDevVersion(dev), true);
  assert.equal(dev.model, null);
});

test('a full recipe succeeds with team bundle, recipe, internal result and stage timings', async () => {
  const events = [];
  const out = await sampleJob(undefined, { onStage: (e) => events.push(`${e.stage}:${e.state}`) });
  assert.equal(out.status, 'succeeded');
  assert.equal(out.canonical_key, 'youtube:Smpl0Gochu1');
  assert.equal(out.bundle.schema_version, '0.1');
  assert.equal(out.recipe.title, '고추장 목살덮밥');
  assert.equal(out.internal.recipe.status, 'ok');
  assert.equal(out.description_only, false);
  // llmOutput skips the model, so structure never starts.
  assert.deepEqual(events, ['collect:started', 'collect:done', 'asr:skipped', 'ocr:skipped', 'finalize:started', 'finalize:done']);
  assert.equal(out.metrics.stages.find((s) => s.stage === 'asr').reason, 'timed_captions_available');
});

test('a progress callback that throws does not fail the job', async () => {
  const out = await sampleJob(undefined, { onStage: () => { throw new Error('db down'); } });
  assert.equal(out.status, 'succeeded');
});

test('a link that is not YouTube fails as unsupported_source without fetching', async () => {
  const out = await runJob({ source_url: 'https://www.instagram.com/reel/abc/' }, { fetchImpl: () => assert.fail('fetched'), env: NO_KEY });
  assert.deepEqual(failure(out), { stage: 'collect', error_code: 'unsupported_source', reason: 'not_youtube', retry: false });
  assert.equal(out.canonical_key, null);
  assert.deepEqual(out.metrics.stages, [{ stage: 'collect', state: 'failed', ms: out.metrics.stages[0].ms }]);
});

test('collect failures map to the section 6 table', async () => {
  const cases = [
    [{ playability: 'LOGIN_REQUIRED', tracks: false }, 'unavailable', 'not_playable', false],
    [{ playerStatus: 503 }, 'retryable', 'collect_network', true],
    [{ playerStatus: 429 }, 'retryable', 'collect_network', true],
    [{ throwOn: '/player' }, 'retryable', 'collect_network', true],
    [{ captionStatus: [403, 403] }, 'unavailable', 'caption_blocked', false],
    [{ captionStatus: [403, 429] }, 'retryable', 'caption_transient', true],
    [{ captionStatus: [500, 403] }, 'retryable', 'caption_transient', true],
    [{ throwOn: 'example.test/caption' }, 'retryable', 'caption_transient', true],
    [{ tracks: false }, 'unavailable', 'no_captions_no_description', false],
  ];
  for (const [yt, error_code, reason, retry] of cases) {
    const out = await runJob({ source_url: URL_OK }, { fetchImpl: youtube(yt), env: NO_KEY });
    assert.deepEqual(failure(out), { stage: 'collect', error_code, reason, retry }, JSON.stringify(yt));
  }
});

test('without captions the description is still read, and no recipe there means unavailable', async () => {
  const fetchImpl = youtube({ tracks: false, description: '재료\n고추장 2스푼\n설탕 1스푼' });
  const notRecipe = await runJob({ source_url: URL_OK }, { fetchImpl, env: NO_KEY, llmOutput: { ...structuredClone(llmFixture), not_a_recipe: true } });
  assert.deepEqual(failure(notRecipe), { stage: 'finalize', error_code: 'unavailable', reason: 'no_captions_no_description', retry: false });
  assert.equal(notRecipe.metrics.stages.find((s) => s.stage === 'asr').reason, 'not_implemented');

  const llmOutput = {
    ...structuredClone(llmFixture),
    ingredients: [{ name: '고추장', preparation: null, amounts: [{ text: '2스푼', evidence: ['D01'] }], evidence: ['D01'], is_group_header: false }],
    steps: [{ text: '고추장을 넣는다.', evidence: ['D01'], is_group_header: false }],
    tips: [],
  };
  const ok = await runJob({ source_url: URL_OK }, { fetchImpl, env: NO_KEY, llmOutput });
  assert.equal(ok.status, 'succeeded');
  assert.equal(ok.description_only, true);
});

test('model verdicts map to not_a_recipe, empty_recipe and partial_recipe', async () => {
  assert.deepEqual(failure(await sampleJob((l) => ({ ...l, not_a_recipe: true }))),
    { stage: 'finalize', error_code: 'not_a_recipe', reason: 'model_not_a_recipe', retry: false });
  const empty = await sampleJob((l) => ({ ...l, ingredients: [], steps: [] }));
  assert.deepEqual(failure(empty), { stage: 'finalize', error_code: 'insufficient', reason: 'empty_recipe', retry: false });
  assert.equal(empty.partial, null);
  assert.equal(empty.metrics.stages.at(-1).state, 'failed');
});

test('a partial recipe fails but carries the part that was found, outside minItems', async () => {
  const out = await sampleJob((l) => ({ ...l, steps: [] }));
  assert.deepEqual(failure(out), { stage: 'finalize', error_code: 'insufficient', reason: 'partial_recipe', retry: false });
  assert.equal(out.partial.recipe.steps.length, 0);
  assert.ok(out.partial.recipe.ingredients.length > 0);
  assert.equal(out.partial.bundle.video_id, 'Smpl0Gochu1');
  assert.equal(out.partial.internal.recipe.steps.length, 0);
});

test('an empty title is our schema problem, not the user\'s', async () => {
  const out = await sampleJob((l) => ({ ...l, title: ' ' }));
  assert.deepEqual(failure(out), { stage: 'finalize', error_code: 'internal', reason: 'team_schema_invalid', retry: false });
});

test('a bug in post-processing is internal/unexpected in the finalize stage', async () => {
  const out = await sampleJob((l) => ({ ...l, ingredients: 'not an array' }));
  assert.deepEqual(failure(out), { stage: 'finalize', error_code: 'internal', reason: 'unexpected', retry: false });
});

test('LLM failures map to retryable or internal', async () => {
  const llm = (reply) => async (url, init) => {
    if (!url.includes('api.openai.com')) return youtube()(url, init);
    if (reply instanceof Error) throw reply;
    return { ok: reply.status === 200, status: reply.status, headers: { get: () => 'application/json' }, json: async () => reply.body };
  };
  const cases = [
    [NO_KEY, llm({ status: 200 }), 'internal', 'llm_config', false],
    [OPENAI, llm({ status: 401, body: { error: { message: 'bad key' } } }), 'internal', 'llm_config', false],
    [OPENAI, llm({ status: 429, body: { error: { message: 'slow down' } } }), 'retryable', 'llm_transient', true],
    [OPENAI, llm({ status: 503, body: {} }), 'retryable', 'llm_transient', true],
    [OPENAI, llm(new TypeError('fetch failed')), 'retryable', 'llm_transient', true],
    [OPENAI, llm({ status: 200, body: { choices: [{ finish_reason: 'length', message: { content: '{' } }] } }), 'internal', 'llm_cut_off', false],
    [OPENAI, llm({ status: 200, body: { choices: [{ message: { refusal: 'no' } }] } }), 'internal', 'llm_refused', false],
    [OPENAI, llm({ status: 200, body: { choices: [{ message: { content: 'not json' } }] } }), 'retryable', 'llm_transient', true],
  ];
  for (const [env, fetchImpl, error_code, reason, retry] of cases) {
    const out = await runJob({ source_url: URL_OK }, { fetchImpl, env });
    assert.deepEqual(failure(out), { stage: 'structure', error_code, reason, retry }, reason);
  }
});

// In-memory stand-in for the worker RPCs. fail mirrors fail_job: a retry under 3 attempts is queued again.
// owned=false plays a worker whose lease ran out, so every write is refused with null.
const fakeDb = ({ cached = null, owned = true } = {}) => {
  const db = {
    calls: [],
    findCachedRun: async () => cached,
    setStage: async (job, stage) => { db.calls.push(['stage', stage]); return owned; },
    completeFromCache: async (job, runId) => { db.calls.push(['cache', runId]); return owned; },
    complete: async (job, out) => { db.calls.push(['complete', out]); return owned ? 'run-1' : null; },
    fail: async (job, out) => {
      db.calls.push(['fail', out]);
      if (!owned) return null;
      return out.retry && job.attempts < 3 ? 'queued' : 'failed';
    },
  };
  return db;
};
const job = (attempts = 1, source_url = URL_OK) => ({ id: 'job-1', source_url, attempts });
const ytRetry = youtube({ playerStatus: 503 });
const last = (db) => db.calls.at(-1);

// Runs the worker on the sample transcript with the model output changed by edit.
const sampleRun = (edit = (llm) => llm) => (input, opts) =>
  runJob(input, { ...opts, transcriptFile: fixture('sample-gochujang-bowl.transcript.json'), llmOutput: edit(structuredClone(llmFixture)) });

test('worker completes a successful job with the team bundle, recipe and internal result', async () => {
  const db = fakeDb();
  const r = await processJob(job(), { db, env: { PIPELINE_TREE: 'abc1234' }, run: sampleRun() });
  assert.deepEqual({ outcome: r.outcome, run_id: r.run_id }, { outcome: 'succeeded', run_id: 'run-1' });
  const [kind, out] = last(db);
  assert.equal(kind, 'complete');
  assert.equal(out.canonical_key, 'youtube:Smpl0Gochu1');
  assert.equal(out.recipe.title, '고추장 목살덮밥');
  assert.equal(out.internal.recipe.status, 'ok');
  assert.match(out.extractor_version.pipeline, /\+abc1234$/);
});

test('worker writes each started stage before the final write', async () => {
  const db = fakeDb();
  const r = await processJob(job(), { db, env: { PIPELINE_TREE: 'abc1234' }, fetchImpl: youtube() });
  // No LLM key, so the run stops in structure.
  assert.equal(r.outcome, 'failed');
  assert.deepEqual(db.calls.map(([k, v]) => (k === 'stage' ? v : k)), ['collect', 'structure', 'fail']);
  assert.equal(last(db)[1].reason, 'llm_config');
});

test('worker reuses a cached run only when the pipeline version is not +dev', async () => {
  const cachedDb = fakeDb({ cached: 'run-old' });
  const r = await processJob(job(), { db: cachedDb, env: { PIPELINE_TREE: 'abc1234' }, fetchImpl: () => assert.fail('fetched') });
  assert.deepEqual(r, { outcome: 'cached', run_id: 'run-old' });
  assert.deepEqual(cachedDb.calls, [['cache', 'run-old']]);

  const devDb = fakeDb({ cached: 'run-old' });
  devDb.findCachedRun = async () => assert.fail('looked up the cache on a +dev version');
  await processJob(job(), { db: devDb, env: NO_KEY, fetchImpl: ytRetry });
});

test('worker hands retries to fail_job, which queues them again until the attempts run out', async () => {
  const first = await processJob(job(1), { db: fakeDb(), env: NO_KEY, fetchImpl: ytRetry });
  assert.equal(first.outcome, 'requeued');
  const db = fakeDb();
  const final = await processJob(job(3), { db, env: NO_KEY, fetchImpl: ytRetry });
  assert.equal(final.outcome, 'failed');
  const out = last(db)[1];
  assert.deepEqual({ error_code: out.error_code, reason: out.reason, retry: out.retry }, { error_code: 'retryable', reason: 'collect_network', retry: true });
});

test('worker sends the partial result to fail_job for a partial recipe', async () => {
  const db = fakeDb();
  const r = await processJob(job(), { db, env: NO_KEY, run: sampleRun((l) => ({ ...l, steps: [] })) });
  assert.deepEqual({ outcome: r.outcome, reason: r.reason }, { outcome: 'failed', reason: 'partial_recipe' });
  const out = last(db)[1];
  assert.equal(out.error_code, 'insufficient');
  assert.equal(out.partial.recipe.steps.length, 0);
  assert.equal(out.partial.bundle.video_id, 'Smpl0Gochu1');
});

test('worker reports a lost job when its lease ran out', async () => {
  assert.equal((await processJob(job(), { db: fakeDb({ owned: false }), env: NO_KEY, run: sampleRun() })).outcome, 'lost');
  assert.equal((await processJob(job(), { db: fakeDb({ owned: false }), env: NO_KEY, fetchImpl: ytRetry })).outcome, 'lost');
});

test('supabaseRpc calls the worker RPCs with the attempt the worker claimed', async () => {
  const sent = [];
  const replies = { claim_next_job: [{ id: 'job-1', attempts: 2 }], complete_job: 'run-9', fail_job: 'failed' };
  const fetchImpl = async (url, init) => {
    const name = url.split('/rpc/')[1];
    sent.push({ name, args: JSON.parse(init.body), auth: init.headers.authorization });
    return { ok: true, status: 200, text: async () => JSON.stringify(replies[name] ?? null) };
  };
  const db = supabaseRpc({ url: 'https://example.supabase.co/', key: 'service-key', fetchImpl });
  const claimed = await db.claimJob();
  assert.deepEqual(claimed, { id: 'job-1', attempts: 2 });
  const out = { canonical_key: 'youtube:x', extractor_version: {}, bundle: {}, recipe: {}, metrics: { stages: [] }, internal: {} };
  assert.equal(await db.complete(claimed, out), 'run-9');
  await db.fail(claimed, { ...out, stage: 'finalize', error_code: 'insufficient', reason: 'partial_recipe', retry: false, message: 'm', partial: { bundle: {}, recipe: {}, internal: {} } });
  assert.deepEqual(sent.map((s) => s.name), ['claim_next_job', 'complete_job', 'fail_job']);
  assert.deepEqual(sent[0].args, { p_lease: '10 minutes' });
  assert.equal(sent[1].args.p_attempt, 2);
  assert.deepEqual(sent[2].args.p_partial, { bundle: {}, recipe: {}, internal: {}, metrics: { stages: [] } });
  assert.equal(sent[0].auth, 'Bearer service-key');
});

test('supabaseRpc reports an RPC error with its status', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => '{"message":"function not found"}' });
  const db = supabaseRpc({ url: 'https://example.supabase.co', key: 'k', fetchImpl });
  await assert.rejects(db.claimJob(), /rpc claim_next_job 404: .*function not found/);
});

test('worker fails an unsupported link without running the pipeline further', async () => {
  const db = fakeDb();
  const r = await processJob(job(1, 'https://www.instagram.com/reel/abc/'), { db, env: NO_KEY });
  assert.equal(r.outcome, 'failed');
  assert.deepEqual(db.calls.map(([k, v]) => (k === 'stage' ? v : k)), ['collect', 'fail']);
  const out = last(db)[1];
  assert.deepEqual({ stage: out.stage, error_code: out.error_code, reason: out.reason }, { stage: 'collect', error_code: 'unsupported_source', reason: 'not_youtube' });
});
