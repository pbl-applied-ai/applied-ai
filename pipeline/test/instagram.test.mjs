// Instagram collector (KAN-53): vendors, failure reasons, speech and caption evidence. No real network calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalKey, runJob } from '../src/job.mjs';
import { parseReelCode } from '../src/instagram.mjs';

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const llmFixture = JSON.parse(readFileSync(fixture('sample-gochujang-bowl.llm.json'), 'utf8'));
const transcript = JSON.parse(readFileSync(fixture('sample-gochujang-bowl.transcript.json'), 'utf8'));
const CODE = 'Smpl0Reel01';
const SOURCE = `https://www.instagram.com/reel/${CODE}/`;
const ENV = { OPENAI_API_KEY: 'test-key', APIFY_TOKEN: 'apify', SCRAPECREATORS_API_KEY: 'sc', LLM_PROVIDER: 'openai' };

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body });
const file = (status = 200, size = 3) => ({ ok: status === 200, status, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(size) });
const whisper = {
  language: 'korean',
  duration: 39,
  segments: transcript.segments.map((s) => ({ start: s.startMs / 1000, end: (s.startMs + s.durMs) / 1000, text: s.text })),
};
const apifyItem = { shortCode: CODE, type: 'Video', caption: '고추장 2큰술', ownerUsername: 'cook', videoDuration: 39, audioUrl: 'https://cdn/a', videoUrl: 'https://cdn/v' };
const scBody = { data: { xdt_shortcode_media: { is_video: true, video_url: 'https://cdn/v', video_duration: 39, owner: { username: 'cook' }, edge_media_to_caption: { edges: [{ node: { text: '고추장 2큰술' } }] } } } };

// Fake network, one answer per service. Records the URLs asked for.
const net = ({ apify = () => json(201, [apifyItem]), sc = () => json(200, scBody), audio = () => file(), video = () => file(), asr = () => json(200, whisper) } = {}) => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    if (String(url).includes('apify.com')) return apify();
    if (String(url).includes('scrapecreators')) return sc();
    if (url === 'https://cdn/a') return audio();
    if (url === 'https://cdn/v') return video();
    if (String(url).includes('audio/transcriptions')) return asr();
    throw new Error(`unexpected ${url}`);
  };
  return { fetchImpl, seen };
};
const reelJob = ({ fetchImpl }, env = ENV) => runJob({ source_url: SOURCE }, { fetchImpl, env, llmOutput: llmFixture });
const failure = (out) => ({ stage: out.stage, error_code: out.error_code, reason: out.reason, retry: out.retry });

test('reel links parse to the code and its own cache key', () => {
  for (const url of [SOURCE, `https://instagram.com/reels/${CODE}/?igsh=x`, `https://www.instagram.com/p/${CODE}/`, `https://m.instagram.com/cook.1/reel/${CODE}`]) {
    assert.equal(parseReelCode(url), CODE, url);
  }
  assert.equal(parseReelCode('https://www.instagram.com/cook/'), null);
  assert.equal(parseReelCode('https://www.youtube.com/shorts/Smpl0Gochu1'), null);
  assert.equal(canonicalKey(SOURCE), `instagram:${CODE}`);
});

test('a reel is collected from Apify audio and makes a recipe with speech and caption evidence', async () => {
  const n = net();
  const out = await reelJob(n);
  assert.equal(out.status, 'succeeded', out.message);
  assert.equal(out.extractor_version.collector, 'instagram+whisper-1');
  assert.ok(n.seen.includes('https://cdn/a'));
  assert.ok(!n.seen.includes('https://cdn/v'), 'the video is not fetched when the audio works');
  assert.ok(!n.seen.some((u) => u.includes('scrapecreators')), 'the backup vendor costs nothing when Apify works');
  assert.equal(out.description_only, false);
  assert.equal(out.bundle.source.kind, 'instagram_reel');
  assert.equal(out.bundle.source.url, SOURCE);
  assert.deepEqual(out.bundle.run.stages.collect, { tool: 'apify', version: 'api' });
  assert.ok(out.bundle.segments.some((s) => s.type === 'asr'));
  assert.ok(out.bundle.segments.some((s) => s.type === 'description'));
  assert.ok(out.internal.recipe.steps.every((s) => s.watch_url === null), 'no YouTube link for a reel');
});

test('the video stands in when there is no audio link or the audio cannot be read', async () => {
  const noAudio = net({ apify: () => json(201, [{ ...apifyItem, audioUrl: null }]) });
  assert.equal((await reelJob(noAudio)).status, 'succeeded');
  assert.ok(noAudio.seen.includes('https://cdn/v'));
  const expired = net({ audio: () => file(403) });
  assert.equal((await reelJob(expired)).status, 'succeeded');
  assert.ok(expired.seen.includes('https://cdn/v'));
});

test('without readable media or speech the caption alone makes a caption-based result', async () => {
  const cases = [
    net({ audio: () => file(403), video: () => file(403) }),
    net({ audio: () => file(200, 25 * 1024 * 1024 + 1) , video: () => file(403) }),
    net({ asr: () => json(400, { error: { message: 'Invalid file format.' } }) }),
    net({ asr: () => json(200, { language: 'khmer', duration: 40, segments: [{ start: 0, end: 2, text: '음악' }] }) }),
  ];
  for (const n of cases) {
    const out = await reelJob(n);
    assert.equal(out.status, 'succeeded', out.message);
    assert.equal(out.description_only, true);
    assert.ok(out.bundle.segments.every((s) => s.type === 'description'));
  }
});

test('a video stuck in speech recognition falls back to the caption, with no caption it still retries', async () => {
  const stuck = () => json(500, {});
  const noAudio = { ...apifyItem, audioUrl: null };
  const out = await reelJob(net({ apify: () => json(201, [noAudio]), asr: stuck }));
  assert.equal(out.status, 'succeeded', out.message);
  assert.equal(out.description_only, true);
  const bare = await reelJob(net({ apify: () => json(201, [{ ...noAudio, caption: '' }]), asr: stuck }));
  assert.deepEqual(failure(bare), { stage: 'asr', error_code: 'retryable', reason: 'asr_transient', retry: true });
});

test('Apify failing or finding nothing goes to ScrapeCreators, and its video is transcribed', async () => {
  for (const apify of [() => json(500, {}), () => json(201, []), () => json(201, [{ url: SOURCE, error: 'not_found' }]), () => { throw new TypeError('fetch failed'); }]) {
    const n = net({ apify });
    const out = await reelJob(n);
    assert.equal(out.status, 'succeeded', out.message);
    assert.deepEqual(out.bundle.run.stages.collect, { tool: 'scrapecreators', version: 'api' });
    assert.ok(n.seen.includes('https://cdn/v'));
  }
});

test('failures map to the section 6 table', async () => {
  const empty = () => json(201, []);
  const down = () => json(503, {});
  const cases = [
    [net({ apify: empty, sc: () => json(404, { error: 'not_found' }) }), { stage: 'collect', error_code: 'unavailable', reason: 'ig_not_found', retry: false }],
    [net({ apify: down, sc: () => json(404, { error: 'not_found' }) }), { stage: 'collect', error_code: 'unavailable', reason: 'ig_not_found', retry: false }],
    [net({ apify: empty, sc: () => json(403, {}) }), { stage: 'collect', error_code: 'unavailable', reason: 'ig_blocked', retry: false }],
    [net({ apify: down, sc: down }), { stage: 'collect', error_code: 'retryable', reason: 'vendor_transient', retry: true }],
    [net({ apify: empty, sc: () => json(402, {}) }), { stage: 'collect', error_code: 'internal', reason: 'vendor_quota', retry: false }],
    [net({ apify: empty, sc: () => json(401, {}) }), { stage: 'collect', error_code: 'internal', reason: 'vendor_config', retry: false }],
    [net({ apify: () => json(201, [{ ...apifyItem, type: 'Image', audioUrl: null, videoUrl: null }]) }), { stage: 'collect', error_code: 'unsupported_source', reason: 'ig_not_video', retry: false }],
    [net({ apify: () => json(201, [{ ...apifyItem, caption: '' }]), asr: () => json(200, { language: 'korean', segments: [] }) }), { stage: 'asr', error_code: 'unavailable', reason: 'no_media_no_caption', retry: false }],
    [net({ asr: () => json(503, {}) }), { stage: 'asr', error_code: 'retryable', reason: 'asr_transient', retry: true }],
  ];
  for (const [n, expected] of cases) {
    assert.deepEqual(failure(await reelJob(n)), expected, expected.reason);
  }
});

test('Apify alone: nothing found is not found, and its own failure is kept', async () => {
  const env = { ...ENV, SCRAPECREATORS_API_KEY: undefined };
  assert.equal((await reelJob(net({ apify: () => json(201, []) }), env)).reason, 'ig_not_found');
  assert.equal((await reelJob(net({ apify: () => json(429, {}) }), env)).reason, 'vendor_transient');
  assert.equal((await reelJob(net({ apify: () => json(402, {}) }), env)).reason, 'vendor_quota');
});

test('a caption that yields no recipe, with no speech, is no_media_no_caption', async () => {
  const n = net({ asr: () => json(200, { language: 'korean', segments: [] }) });
  const out = await runJob({ source_url: SOURCE }, { fetchImpl: n.fetchImpl, env: ENV, llmOutput: { ...llmFixture, status: 'not_a_recipe', ingredients: [], steps: [] } });
  assert.deepEqual(failure(out), { stage: 'finalize', error_code: 'unavailable', reason: 'no_media_no_caption', retry: false });
});

test('without vendor keys Instagram stays unsupported and calls nothing', async () => {
  const out = await reelJob({ fetchImpl: () => assert.fail('fetched') }, { OPENAI_API_KEY: 'test-key' });
  assert.deepEqual(failure(out), { stage: 'collect', error_code: 'unsupported_source', reason: 'not_youtube', retry: false });
});
