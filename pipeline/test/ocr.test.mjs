import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFrameTexts, ocrEnabled, readScreenText } from '../src/ocr.mjs';
import { pickVideoFormat } from '../src/youtube.mjs';
import { runPipeline } from '../src/pipeline.mjs';
import { renderForPrompt } from '../src/segments.mjs';
import { toEvidenceBundle } from '../src/team-schema.mjs';

const OCR_ENV = { OPENAI_API_KEY: 'test-key', OCR: 'on' };
const frames = (n) => ({ frames: Array.from({ length: n }, (_, i) => ({ ms: i * 1000, jpeg: new Uint8Array([i]) })), everyMs: 1000 });

// Fake vision API: answers each batch with the texts given for its frame numbers.
const vision = (texts, calls = []) => async (url, init) => {
  assert.equal(url, 'https://api.openai.com/v1/chat/completions');
  const body = JSON.parse(init.body);
  calls.push(body);
  const nums = body.messages[1].content
    .filter((c) => c.type === 'text')
    .map((c) => c.text.match(/^Frame (\d+):$/)?.[1])
    .filter(Boolean)
    .map(Number);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ frames: nums.map((n) => ({ frame: n, text: texts[n - 1] ?? '' })) }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    }),
  };
};

test('ocr is opt-in and needs the OpenAI key', () => {
  assert.equal(ocrEnabled({ OPENAI_API_KEY: 'k' }), false);
  assert.equal(ocrEnabled({ OCR: 'on' }), false);
  assert.equal(ocrEnabled(OCR_ENV), true);
});

test('text kept on screen is one segment; a growing list keeps its earlier lines once', () => {
  const merged = mergeFrameTexts(['', 'INGREDIENTS\n2 tbsp butter', 'Ingredients\n2 tbsp butter\n1 cup cream', '1 cup cream', ''], 1000);
  assert.deepEqual(merged, [
    { startMs: 1000, endMs: 3000, text: 'INGREDIENTS' },
    { startMs: 1000, endMs: 3000, text: '2 tbsp butter' },
    { startMs: 2000, endMs: 4000, text: '1 cup cream' },
  ]);
});

test('text that comes back after a gap is a new segment', () => {
  const merged = mergeFrameTexts(['Salt', '', 'Salt'], 500);
  assert.deepEqual(merged.map((s) => [s.startMs, s.endMs]), [[0, 500], [1000, 1500]]);
});

test('readScreenText reads frames in batches and returns timed O segments', async () => {
  const calls = [];
  const texts = Array.from({ length: 20 }, (_, i) => (i < 3 ? '' : i < 18 ? '1/2 cup mozzarella' : 'Bake 15 min'));
  const out = await readScreenText({ bytes: new Uint8Array(1) }, { env: OCR_ENV, fetchImpl: vision(texts, calls), sample: async () => frames(20) });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].model, 'gpt-4.1-mini');
  assert.equal(calls[0].messages[1].content.filter((c) => c.type === 'image_url').length, 15);
  assert.deepEqual(out.segments, [
    { id: 'O01', kind: 'ocr', startMs: 3000, endMs: 18000, text: '1/2 cup mozzarella' },
    { id: 'O02', kind: 'ocr', startMs: 18000, endMs: 20000, text: 'Bake 15 min' },
  ]);
  assert.equal(out.usage.total_tokens, 24);
});

test('the smallest MP4 with a short side of 360px or more is picked', () => {
  const f = (itag, width, height, mimeType = 'video/mp4; codecs="avc1"') => ({ itag, width, height, mimeType, url: `https://v/${itag}` });
  assert.equal(pickVideoFormat([f(137, 1080, 1920), f(135, 480, 854), f(134, 360, 640), f(133, 240, 426), f(243, 360, 640, 'video/webm')]).itag, 134);
  assert.equal(pickVideoFormat([f(133, 240, 426), f(160, 144, 256)]).itag, 133);
  assert.equal(pickVideoFormat([{ itag: 1, mimeType: 'video/mp4', width: 360, height: 640, signatureCipher: 'x' }]), null);
});

const upload = { id: 'u1', bytes: new Uint8Array(4), filename: 'clip.mp4', mime: 'video/mp4' };
const silentWhisper = { text: '', language: 'english', duration: 10, segments: [] };
const speechWhisper = {
  text: 'Add the mozzarella.',
  language: 'english',
  duration: 3,
  segments: [{ start: 0, end: 3, text: 'Add the mozzarella.', no_speech_prob: 0.01, avg_logprob: -0.2 }],
};
const llm = {
  not_a_recipe: false,
  title: 'Twists',
  servings: null,
  servings_evidence: [],
  ingredients: [{ name: 'mozzarella', preparation: null, is_group_header: false, amounts: [{ text: '1/2 cup', evidence: ['O01'] }], evidence: ['O01'] }],
  steps: [{ text: 'Bake.', is_group_header: false, evidence: ['O02'] }],
  tips: [],
};

// Whisper answers the upload with the given transcript, vision with the given texts.
const uploadFetch = (whisper, texts) => {
  const v = vision(texts);
  return async (url, init) =>
    url.includes('/audio/transcriptions') ? { ok: true, status: 200, json: async () => whisper } : v(url, init);
};
const log = (events) => (e) => events.push(`${e.stage}:${e.state}${e.reason ? `:${e.reason}` : ''}`);

test('an upload with only on-screen text makes a recipe from it, with ocr segments in the bundle', async () => {
  const events = [];
  const texts = ['', '1/2 cup mozzarella', '1/2 cup mozzarella', 'Bake 15 min'];
  const result = await runPipeline({
    upload,
    env: OCR_ENV,
    fetchImpl: uploadFetch(silentWhisper, texts),
    llmOutput: llm,
    ocr: { sample: async () => frames(4) },
    onStage: log(events),
  });
  assert.deepEqual(events.slice(0, 6), ['collect:started', 'collect:done', 'asr:started', 'asr:done', 'ocr:started', 'ocr:done']);
  assert.equal(result.recipe.ingredients[0].amount_status, 'confirmed');
  assert.equal(result.recipe.steps[0].start_ms, 3000);
  assert.match(renderForPrompt(result.evidence), /\[O01 00:01 화면\] 1\/2 cup mozzarella/);
  const bundle = toEvidenceBundle(result);
  assert.deepEqual(bundle.segments.find((s) => s.id === 'ocr-0'), { id: 'ocr-0', type: 'ocr', start_ms: 1000, end_ms: 3000, text: '1/2 cup mozzarella' });
  assert.equal(bundle.run.stages.ocr.version, 'gpt-4.1-mini');
});

test('with no speech and no screen text an upload still fails as no_speech', async () => {
  await assert.rejects(
    runPipeline({ upload, env: OCR_ENV, fetchImpl: uploadFetch(silentWhisper, []), llmOutput: llm, ocr: { sample: async () => frames(2) } }),
    (err) => err.reason === 'no_speech' && err.stage === 'asr',
  );
});

test('a failed OCR request skips the stage, marks the run, and keeps the other evidence', async () => {
  const events = [];
  const fetchImpl = async (url) =>
    url.includes('/audio/transcriptions')
      ? { ok: true, status: 200, json: async () => speechWhisper }
      : { ok: false, status: 503, json: async () => ({ error: { message: 'busy' } }) };
  const result = await runPipeline({
    upload,
    env: OCR_ENV,
    fetchImpl,
    llmOutput: { ...llm, ingredients: [], steps: [] },
    ocr: { sample: async () => frames(2) },
    onStage: log(events),
  });
  assert.ok(events.includes('ocr:skipped:ocr_transient'), events.join(' '));
  assert.equal(result.meta.ocr_lost, true);
  assert.equal(result.evidence.filter((e) => e.kind === 'ocr').length, 0);
  assert.ok(result.evidence.some((e) => e.kind === 'speech'));
});

test('an audio-only upload skips OCR as no_video', async () => {
  const events = [];
  await runPipeline({
    upload: { ...upload, filename: 'a.m4a', mime: 'audio/mp4' },
    env: OCR_ENV,
    llmOutput: llm,
    fetchImpl: uploadFetch(speechWhisper, []),
    onStage: log(events),
  });
  assert.ok(events.includes('ocr:skipped:no_video'), events.join(' '));
});

test('without OCR=on the stage is skipped as ocr_off and nothing is downloaded', async () => {
  const events = [];
  await runPipeline({ upload, env: { OPENAI_API_KEY: 'k' }, llmOutput: llm, fetchImpl: uploadFetch(speechWhisper, []), onStage: log(events) });
  assert.ok(events.includes('ocr:skipped:ocr_off'), events.join(' '));
});
