import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, examplesFor, pickExamples } from '../src/fewshot.mjs';
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
  assert.deepEqual(await examplesFor('prompt', { env: { FEWSHOT_INDEX: 'x', FEWSHOT_K: '0' }, fetchImpl }), []);
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
