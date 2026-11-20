import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, examplesFor, fewshotEnabled, fewshotVersion, pickExamples } from '../src/fewshot.mjs';
import { extractorVersion, runJob } from '../src/job.mjs';
import { extractRecipe } from '../src/llm.mjs';

const index = {
  examples: [
    { id: 'a', user: 'ua', assistant: '{"a":1}', embedding: [1, 0] },
    { id: 'b', user: 'ub', assistant: '{"b":1}', embedding: [0, 1] },
    { id: 'c', user: 'uc', assistant: '{"c":1}', embedding: [0.9, 0.1] },
  ],
};

test('pickExamples returns the closest examples first', () => {
  assert.deepEqual(pickExamples(index, [1, 0], 2).map((e) => e.id), ['a', 'c']);
  assert.deepEqual(pickExamples(index, [0, 1], 1).map((e) => e.id), ['b']);
});

test('examplesFor is off without FEWSHOT_INDEX and makes no call', async () => {
  const fetchImpl = () => assert.fail('no call expected');
  assert.deepEqual(await examplesFor('prompt', { env: {}, fetchImpl }), []);
  assert.deepEqual(await examplesFor('prompt', { env: { FEWSHOT_INDEX: 'x', FEWSHOT_K: '0', OPENAI_API_KEY: 'k' }, fetchImpl }), []);
  // The query embedding needs the OpenAI key, so without it few-shot stays off instead of failing the job
  assert.deepEqual(await examplesFor('prompt', { env: { FEWSHOT_INDEX: 'x' }, fetchImpl }), []);
  assert.equal(fewshotEnabled({ FEWSHOT_INDEX: 'x', OPENAI_API_KEY: 'k' }), true);
});

const KEY_ENV = { OPENAI_API_KEY: 'test-key', LLM_PROVIDER: 'openai', AMOUNT_ESTIMATE: 'off' };
async function withIndexFile(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'fewshot-'));
  try {
    return await fn(join(dir, 'index.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the cache key carries the index hash and k only while few-shot is on (#58 review)', async () => {
  await withIndexFile((file) => {
    writeFileSync(file, JSON.stringify(index));
    const v = extractorVersion({ ...KEY_ENV, FEWSHOT_INDEX: file });
    assert.match(v.fewshot.index, /^[0-9a-f]{12}$/);
    assert.equal(v.fewshot.k, 2);
    assert.equal(extractorVersion({ ...KEY_ENV, FEWSHOT_INDEX: file, FEWSHOT_K: '3' }).fewshot.k, 3);
    writeFileSync(file, JSON.stringify({ examples: index.examples.slice(1) }) + ' ');
    assert.notEqual(fewshotVersion({ FEWSHOT_INDEX: file }).index, v.fewshot.index, 'another index is another key');
    assert.equal(extractorVersion(KEY_ENV).fewshot, undefined);
    assert.equal(extractorVersion({ ...KEY_ENV, FEWSHOT_INDEX: file, FEWSHOT_K: '0' }).fewshot, undefined);
  });
  assert.equal(fewshotVersion({ FEWSHOT_INDEX: join(tmpdir(), 'no-such-fewshot-index.json') }).index, 'unreadable');
});

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const llmFixture = readFileSync(fixture('sample-gochujang-bowl.llm.json'), 'utf8');
const TRANSCRIPT = fileURLToPath(fixture('sample-gochujang-bowl.transcript.json'));
const chatReply = () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: llmFixture }, finish_reason: 'stop' }], usage: {} }) });

test('a failed embedding call or unreadable index does not fail the job: no examples, a warning, not reused (#58 review)', async () => {
  await withIndexFile(async (file) => {
    writeFileSync(file, JSON.stringify(index));
    const chats = [];
    const fetchImpl = async (url, init) => {
      if (url.endsWith('/embeddings')) return { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) };
      chats.push(JSON.parse(init.body));
      return chatReply();
    };
    for (const env of [{ ...KEY_ENV, FEWSHOT_INDEX: file }, { ...KEY_ENV, FEWSHOT_INDEX: `${file}.missing` }]) {
      const out = await runJob({ source_url: 'https://www.youtube.com/shorts/Smpl0Gochu1' }, { env, transcriptFile: TRANSCRIPT, fetchImpl });
      assert.equal(out.status, 'succeeded', out.message);
      assert.equal(out.extractor_version.fewshot, 'lost');
      assert.ok(out.warnings.some((w) => /few-shot examples skipped/.test(w)));
      assert.equal(out.internal.meta.fewshot_lost, true);
    }
    assert.equal(chats.length, 2);
    assert.ok(chats.every((b) => b.messages.length === 2), 'the recipe call goes out without example turns');
  });
});

test('buildIndex embeds each user prompt and keeps the answer', async () => {
  const jsonl = [1, 2].map((n) => JSON.stringify({ messages: [{ role: 'system', content: 's' }, { role: 'user', content: `u${n}` }, { role: 'assistant', content: `a${n}` }] })).join('\n');
  let sent;
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ data: sent.input.map((_, i) => ({ index: i, embedding: [i, 1] })) }) };
  };
  const out = await buildIndex(jsonl, { apiKey: 'k', fetchImpl, ids: ['T-1', 'T-2'] });
  assert.deepEqual(sent.input, ['u1', 'u2']);
  assert.deepEqual(out.examples.map((e) => [e.id, e.user, e.assistant, e.embedding]), [['T-1', 'u1', 'a1', [0, 1]], ['T-2', 'u2', 'a2', [1, 1]]]);
});

test('extractRecipe sends examples as earlier turns before the prompt', async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    const ok = url.includes('openai')
      ? { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }
      : { content: [{ type: 'tool_use', input: {} }], stop_reason: 'tool_use' };
    return { ok: true, status: 200, json: async () => ok };
  };
  const examples = [{ user: 'ex-u', assistant: 'ex-a' }];
  await extractRecipe({ provider: 'openai', apiKey: 'k', model: 'm' }, 'real', { fetchImpl, examples });
  await extractRecipe({ provider: 'anthropic', apiKey: 'k', model: 'm' }, 'real', { fetchImpl, examples });
  assert.deepEqual(bodies[0].messages.map((m) => [m.role, m.content]).slice(1), [['user', 'ex-u'], ['assistant', 'ex-a'], ['user', 'real']]);
  assert.deepEqual(bodies[1].messages.map((m) => [m.role, m.content]), [['user', 'ex-u'], ['assistant', 'ex-a'], ['user', 'real']]);
});

test('examples from an index built with the old Korean labels use the English labels', async () => {
  const { englishLabels } = await import('../src/fewshot.mjs');
  assert.equal(englishLabels('[D01 설명] 1 tbsp soy\n[C02 고정 댓글] eggs\n[O03 00:09 화면] 1 cup'), '[D01 description] 1 tbsp soy\n[C02 pinned] eggs\n[O03 00:09 on screen] 1 cup');
});
