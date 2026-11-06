// Upload path (KAN-49): the file comes from the worker, speech is transcribed, the original is deleted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readTranscript, toSegments } from '../src/asr.mjs';
import { canonicalKey, runJob, uploadId } from '../src/job.mjs';
import { processJob, supabaseRpc } from '../src/worker.mjs';

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const llmFixture = JSON.parse(readFileSync(fixture('sample-gochujang-bowl.llm.json'), 'utf8'));
const transcript = JSON.parse(readFileSync(fixture('sample-gochujang-bowl.transcript.json'), 'utf8'));
const ID = '0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e';
const SOURCE = `upload:${ID}`;
const PATH = `incoming/${ID}.mp4`;
const FILE = { bytes: new Uint8Array([1, 2, 3]), filename: 'upload.mp4', mime: 'video/mp4' };
const OPENAI = { OPENAI_API_KEY: 'test-key' };

// The sample transcript as Whisper verbose_json, so the speech IDs match the sample model output.
const whisperBody = {
  language: 'korean',
  duration: 39,
  segments: transcript.segments.map((s) => ({ start: s.startMs / 1000, end: (s.startMs + s.durMs) / 1000, text: s.text })),
};

// Fake transcription endpoint. Records each request it receives.
const asr = ({ status = 200, body = whisperBody, throws = false } = {}) => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if (throws) throw new TypeError('fetch failed');
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
    return { ok: status === 200, status, json: async () => body };
  };
  return { fetchImpl, seen };
};

const failure = (out) => ({ stage: out.stage, error_code: out.error_code, reason: out.reason, retry: out.retry });
const uploadJob = (opts = {}, input = { source_url: SOURCE, upload: FILE }) =>
  runJob(input, { env: OPENAI, llmOutput: structuredClone(llmFixture), fetchImpl: asr().fetchImpl, ...opts });

test('an upload source is its own key and never a YouTube link', () => {
  assert.equal(uploadId(SOURCE), ID);
  assert.equal(canonicalKey(SOURCE), `upload:${ID}`);
  assert.equal(uploadId('upload:not-a-uuid'), null);
  assert.equal(canonicalKey('upload:not-a-uuid'), null);
  assert.equal(uploadId('https://www.youtube.com/shorts/Smpl0Gochu1'), null);
});

test('Whisper segments become timed speech segments, empty text dropped', () => {
  assert.deepEqual(toSegments({ segments: [{ start: 1.2, end: 3.456, text: ' 고추장 두 스푼 ' }, { start: 4, end: 5, text: '  ' }] }), [
    { startMs: 1200, durMs: 2256, text: '고추장 두 스푼' },
  ]);
  assert.deepEqual(toSegments({}), []);
});

test('a segment Whisper itself marks as silent is dropped', () => {
  const silent = { start: 0, end: 2, text: '자막 제공', no_speech_prob: 0.9, avg_logprob: -1.5 };
  const unsure = { start: 2, end: 4, text: '고추장 두 스푼', no_speech_prob: 0.9, avg_logprob: -0.3 };
  assert.deepEqual(toSegments({ segments: [silent, unsure] }).map((s) => s.text), ['고추장 두 스푼']);
});

test('a few words in an unexpected language count as no speech, real speech does not', () => {
  const body = (language, text, duration = 40) => ({ language, duration, segments: [{ start: 0, end: 2, text }] });
  assert.deepEqual(readTranscript(body('khmer', '짧은 글')).segments, []);
  assert.equal(readTranscript(body('korean', '짧은 글')).segments.length, 1, 'an expected language keeps short speech');
  assert.equal(readTranscript(body('japanese', 'あ'.repeat(200))).segments.length, 1, 'long speech in another language stays');
  assert.equal(readTranscript({ language: 'khmer', segments: [{ start: 0, end: 2, text: '짧은 글' }] }).segments.length, 1, 'no duration, no rate to judge');
});

test('an uploaded file is transcribed and makes a recipe with an upload bundle and no video links', async () => {
  const events = [];
  const { fetchImpl, seen } = asr();
  const out = await uploadJob({ fetchImpl, onStage: (e) => events.push(`${e.stage}:${e.state}`) });
  assert.equal(out.status, 'succeeded', out.message);
  assert.equal(out.canonical_key, `upload:${ID}`);
  assert.equal(out.extractor_version.collector, 'upload+whisper-1');
  assert.deepEqual(events, ['collect:started', 'collect:done', 'asr:started', 'asr:done', 'ocr:skipped', 'finalize:started', 'finalize:done']);

  assert.equal(out.bundle.video_id, ID);
  assert.deepEqual(out.bundle.source, { kind: 'upload', duration_ms: 39000 });
  assert.equal(out.bundle.run.stages.asr.version, 'whisper-1');
  assert.ok(out.bundle.segments.every((s) => s.type === 'asr'));
  assert.equal(out.recipe.title, '고추장 목살덮밥');
  assert.ok(out.internal.recipe.steps.every((s) => s.watch_url === null), 'an upload has no video to link to');

  const form = seen[0].init.body;
  assert.equal(form.get('model'), 'whisper-1');
  assert.equal(form.get('response_format'), 'verbose_json');
  assert.equal(form.get('file').type, 'video/mp4');
  assert.equal(seen[0].init.headers.authorization, 'Bearer test-key');
});

test('upload failures map to the section 6 table', async () => {
  const cases = [
    [{ fetchImpl: asr({ body: { segments: [] } }).fetchImpl }, { stage: 'asr', error_code: 'unavailable', reason: 'no_speech', retry: false }],
    [{ fetchImpl: asr({ body: { language: 'khmer', duration: 40, segments: [{ start: 0, end: 2, text: '음악' }] } }).fetchImpl }, { stage: 'asr', error_code: 'unavailable', reason: 'no_speech', retry: false }],
    [{ fetchImpl: asr({ status: 429, body: { error: { message: 'slow down' } } }).fetchImpl }, { stage: 'asr', error_code: 'retryable', reason: 'asr_transient', retry: true }],
    [{ fetchImpl: asr({ status: 503, body: {} }).fetchImpl }, { stage: 'asr', error_code: 'retryable', reason: 'asr_transient', retry: true }],
    [{ fetchImpl: asr({ throws: true }).fetchImpl }, { stage: 'asr', error_code: 'retryable', reason: 'asr_transient', retry: true }],
    [{ fetchImpl: asr({ status: 400, body: { error: { message: 'Invalid file format.' } } }).fetchImpl }, { stage: 'asr', error_code: 'unavailable', reason: 'upload_unreadable', retry: false }],
    [{ fetchImpl: asr({ status: 413, body: {} }).fetchImpl }, { stage: 'asr', error_code: 'unavailable', reason: 'upload_too_large', retry: false }],
    [{ fetchImpl: asr({ status: 401, body: {} }).fetchImpl }, { stage: 'asr', error_code: 'internal', reason: 'asr_config', retry: false }],
    [{ env: {}, fetchImpl: () => assert.fail('called without a key') }, { stage: 'asr', error_code: 'internal', reason: 'asr_config', retry: false }],
  ];
  for (const [opts, expected] of cases) {
    assert.deepEqual(failure(await uploadJob(opts)), expected, expected.reason);
  }
});

test('a file over 25 MB fails before it is sent', async () => {
  const big = { ...FILE, bytes: new Uint8Array(25 * 1024 * 1024 + 1) };
  const out = await uploadJob({ fetchImpl: () => assert.fail('sent a file over the limit') }, { source_url: SOURCE, upload: big });
  assert.deepEqual(failure(out), { stage: 'asr', error_code: 'unavailable', reason: 'upload_too_large', retry: false });
});

test('an upload job without its file fails as upload_missing', async () => {
  const out = await uploadJob({ fetchImpl: () => assert.fail('fetched') }, { source_url: SOURCE });
  assert.deepEqual(failure(out), { stage: 'collect', error_code: 'unavailable', reason: 'upload_missing', retry: false });
});

// In-memory worker RPCs plus the two storage calls.
const fakeDb = ({ file = FILE, failStatus = 'failed' } = {}) => {
  const db = {
    calls: [],
    findCachedRun: async () => assert.fail('looked up the cache for an upload'),
    downloadUpload: async (path) => { db.calls.push(['download', path]); return file; },
    deleteUpload: async (path) => { db.calls.push(['delete', path]); },
    setStage: async (job, stage) => { db.calls.push(['stage', stage]); return true; },
    complete: async (job, out) => { db.calls.push(['complete', out]); return 'run-1'; },
    fail: async (job, out) => { db.calls.push(['fail', out]); return failStatus; },
  };
  return db;
};
const job = { id: 'job-1', source_url: SOURCE, upload_path: PATH, attempts: 1 };
const kinds = (db) => db.calls.map(([k, v]) => (k === 'stage' ? v : k));

test('worker reads the uploaded file, saves the recipe, then deletes the file', async () => {
  const db = fakeDb();
  const run = (input, opts) => runJob(input, { ...opts, llmOutput: structuredClone(llmFixture) });
  const r = await processJob(job, { db, env: { ...OPENAI, PIPELINE_TREE: 'abc1234' }, fetchImpl: asr().fetchImpl, run });
  assert.equal(r.outcome, 'succeeded');
  assert.deepEqual(kinds(db), ['download', 'collect', 'asr', 'finalize', 'complete', 'delete']);
  assert.equal(db.calls.at(-1)[1], PATH);
});

test('worker keeps the file for a retry and deletes it once the job has failed for good', async () => {
  const retry = fakeDb({ failStatus: 'queued' });
  assert.equal((await processJob(job, { db: retry, env: OPENAI, fetchImpl: asr({ status: 503, body: {} }).fetchImpl })).outcome, 'requeued');
  assert.ok(!kinds(retry).includes('delete'));

  const done = fakeDb();
  assert.equal((await processJob(job, { db: done, env: OPENAI, fetchImpl: asr({ body: { segments: [] } }).fetchImpl })).outcome, 'failed');
  assert.equal(kinds(done).at(-1), 'delete');
});

test('worker fails a job whose file is gone as upload_missing', async () => {
  const db = fakeDb({ file: null });
  const r = await processJob(job, { db, env: OPENAI, fetchImpl: () => assert.fail('fetched') });
  assert.deepEqual({ outcome: r.outcome, reason: r.reason }, { outcome: 'failed', reason: 'upload_missing' });
});

test('a storage error while reading the file fails the job as a retry and keeps the file', async () => {
  const db = { ...fakeDb({ failStatus: 'queued' }), downloadUpload: async () => { throw new Error('Supabase storage get 503: busy'); } };
  const r = await processJob(job, { db, env: OPENAI, fetchImpl: () => assert.fail('fetched'), run: () => assert.fail('ran the pipeline') });
  assert.equal(r.outcome, 'requeued');
  const [, out] = db.calls.find(([k]) => k === 'fail');
  assert.deepEqual({ stage: out.stage, error_code: out.error_code, reason: out.reason, retry: out.retry }, { stage: 'collect', error_code: 'retryable', reason: 'collect_network', retry: true });
  assert.ok(!kinds(db).includes('delete'));
});

test('mov and m4v go to speech recognition as mp4, which the API accepts', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([9]).buffer, text: async () => '' });
  const db = supabaseRpc({ url: 'https://db.test', key: 'svc', fetchImpl });
  const sent = async (ext) => { const { filename, mime } = await db.downloadUpload(`incoming/${ID}.${ext}`); return [filename, mime]; };
  assert.deepEqual(await sent('mov'), ['upload.mp4', 'video/mp4']);
  assert.deepEqual(await sent('m4v'), ['upload.mp4', 'video/mp4']);
  assert.deepEqual(await sent('webm'), ['upload.webm', 'video/webm']);
});

test('supabaseRpc reads and deletes uploads in the private uploads bucket with the service key', async () => {
  const sent = [];
  const fetchImpl = async (url, init = {}) => {
    sent.push({ url, method: init.method ?? 'GET', key: init.headers?.apikey });
    if (url.endsWith('gone.mp4')) return { ok: false, status: 404, text: async () => 'not found' };
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([9]).buffer, text: async () => '' };
  };
  const db = supabaseRpc({ url: 'https://db.test/', key: 'svc', fetchImpl });
  const file = await db.downloadUpload(PATH);
  assert.deepEqual({ ...file, bytes: [...file.bytes] }, { bytes: [9], filename: 'upload.mp4', mime: 'video/mp4' });
  await db.deleteUpload(PATH);
  assert.equal(await db.downloadUpload('incoming/gone.mp4'), null);
  assert.deepEqual(sent.slice(0, 2), [
    { url: `https://db.test/storage/v1/object/uploads/${PATH}`, method: 'GET', key: 'svc' },
    { url: `https://db.test/storage/v1/object/uploads/${PATH}`, method: 'DELETE', key: 'svc' },
  ]);
});

test('a storage 400 means a missing file only when its body says not_found', async () => {
  const reply = { missing: [400, '{"statusCode":"404","error":"not_found","message":"Object not found"}'], badKey: [400, '{"statusCode":"403","error":"Unauthorized","message":"invalid signature"}'] };
  const fetchImpl = async (url) => {
    const [status, body] = reply[url.split('/').pop().split('.')[0]];
    return new Response(body, { status });
  };
  const db = supabaseRpc({ url: 'https://db.test', key: 'svc', fetchImpl });
  assert.equal(await db.downloadUpload('incoming/missing.mp4'), null);
  await assert.rejects(db.downloadUpload('incoming/badKey.mp4'), /storage get 400: .*invalid signature/);
  await db.deleteUpload('incoming/missing.mp4');
  await assert.rejects(db.deleteUpload('incoming/badKey.mp4'), /storage delete 400/);
});

test('a file the worker could not read is kept even when the job fails for good', async () => {
  const db = { ...fakeDb({ failStatus: 'failed' }), downloadUpload: async () => { throw new Error('Supabase storage get 400: invalid signature'); } };
  const r = await processJob(job, { db, env: OPENAI, fetchImpl: () => assert.fail('fetched'), run: () => assert.fail('ran the pipeline') });
  assert.equal(r.outcome, 'failed');
  assert.ok(!kinds(db).includes('delete'));
});
