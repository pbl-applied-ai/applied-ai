// On-screen text (KAN-51): frames merged into timed segments, shown to the model as [O01 00:04 화면].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFrames, ocrEnabled, readScreenText } from '../src/ocr.mjs';
import { ocrSegments, renderForPrompt } from '../src/segments.mjs';
import { SYSTEM_PROMPT, SYSTEM_PROMPT_OCR } from '../src/schema.mjs';
import { toEvidenceBundle } from '../src/team-schema.mjs';

test('the same text on consecutive frames becomes one segment with its span', () => {
  assert.deepEqual(mergeFrames(['', '고추장 2T', '고추장  2T', '', '설탕 1T', '설탕 1T'], 2000), [
    { startMs: 2000, durMs: 4000, text: '고추장 2T' },
    { startMs: 8000, durMs: 4000, text: '설탕 1T' },
  ]);
  assert.deepEqual(mergeFrames(['a', '', 'a'], 2000).map((s) => s.startMs), [0, 4000], 'a gap splits the run');
});

test('segments are timed evidence the prompt labels as on-screen text', () => {
  const segs = ocrSegments([{ startMs: 4000, durMs: 2000, text: '고추장 2T' }]);
  assert.deepEqual(segs, [{ id: 'O01', kind: 'ocr', startMs: 4000, endMs: 6000, text: '고추장 2T' }]);
  assert.equal(renderForPrompt(segs), '[O01 00:04 화면] 고추장 2T');
  assert.ok(SYSTEM_PROMPT_OCR.startsWith(SYSTEM_PROMPT.split('\n\n## Rules')[0]));
  assert.match(SYSTEM_PROMPT_OCR, /\[O04 00:12 화면\]/);
  assert.doesNotMatch(SYSTEM_PROMPT, /화면\]/, 'v7 is unchanged');
});

test('the bundle keeps on-screen text as ocr segments with times', () => {
  const result = {
    source: { platform: 'upload', videoId: 'u1', title: null, caption: { client: 'whisper-1' } },
    evidence: ocrSegments([{ startMs: 0, durMs: 2000, text: '설탕 1T' }]),
    meta: { generated_at: '2026-11-08T00:00:00Z', ocr: { model: 'gpt-4.1' } },
  };
  const bundle = toEvidenceBundle(result);
  assert.deepEqual(bundle.segments, [{ id: 'ocr-0', type: 'ocr', start_ms: 0, end_ms: 2000, text: '설탕 1T' }]);
  assert.equal(bundle.run.stages.ocr.version, 'gpt-4.1');
});

test('frames are read in batches and matched back by number', async () => {
  const frames = Array.from({ length: 12 }, (_, i) => ({ atMs: i * 2000, jpeg: Buffer.from([i]) }));
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const images = body.messages[0].content.filter((c) => c.type === 'image_url');
    calls.push(images.length);
    const first = calls.length === 1 ? 1 : 11;
    const reply = { frames: [{ number: first, text: first === 1 ? '고추장 2T' : '' }, { number: first + 1, text: first === 1 ? '고추장 2T' : '설탕 1T' }, { number: 99, text: 'x' }] };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }));
  };
  const out = await readScreenText(null, { env: { OPENAI_API_KEY: 'k' }, fetchImpl, frames });
  assert.deepEqual(calls, [10, 2]);
  assert.deepEqual(out.segments, [
    { startMs: 0, durMs: 4000, text: '고추장 2T' },
    { startMs: 22000, durMs: 2000, text: '설탕 1T' },
  ]);
  assert.deepEqual(out.usage, { prompt_tokens: 20, completion_tokens: 4 });
});

test('off unless asked for, and never without an OpenAI key', () => {
  assert.equal(ocrEnabled({ OPENAI_API_KEY: 'k' }), false);
  assert.equal(ocrEnabled({ OCR: 'on' }), false);
});
