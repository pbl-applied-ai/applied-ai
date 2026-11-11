import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelIdMap, renderBundle, toTrainingExample } from '../src/train-data.mjs';
import { RECIPE_SCHEMA, SYSTEM_PROMPT } from '../src/schema.mjs';

const bundle = {
  schema_version: '0.2',
  video_id: 'Smpl0Train1',
  source: { kind: 'youtube_shorts', title: 'Soy garlic eggs', channel: 'Sample Kitchen' },
  segments: [
    { id: 'title-0', type: 'title', text: 'Soy garlic eggs' },
    { id: 'asr-0', type: 'asr', start_ms: 0, end_ms: 2000, text: 'boil the eggs for 7 minutes' },
    { id: 'asr-1', type: 'asr', start_ms: 65000, end_ms: 67000, text: 'then 2 tbsp soy sauce' },
    { id: 'comment-0', type: 'comment', text: 'eggs 4' },
    { id: 'desc-0', type: 'description', text: 'soy sauce 2 tbsp' },
  ],
};

const gold = {
  schema_version: '0.2',
  video_id: 'Smpl0Train1',
  title: 'Soy garlic eggs',
  servings_raw: null,
  ingredients: [
    { id: 'ing-1', name: 'eggs', amount_raw: '4', amount_status: 'confirmed', evidence: ['asr-0', 'comment-0'] },
    { id: 'ing-2', name: 'soy sauce', amount_raw: '2 tbsp', amount_status: 'confirmed', evidence: ['asr-1', 'desc-0', 'title-0'] },
    { id: 'ing-3', name: 'garlic', amount_raw: null, amount_status: 'unconfirmed', evidence: ['title-0', 'asr-1'] },
  ],
  steps: [
    { id: 'step-2', order: 2, text: 'Add soy sauce.', evidence: ['asr-1'] },
    { id: 'step-1', order: 1, text: 'Boil the eggs for 7 minutes.', evidence: ['asr-0'] },
  ],
};

test('bundle IDs map to the IDs the pipeline shows the model', () => {
  assert.deepEqual([...modelIdMap(bundle)], [['asr-0', 'S01'], ['asr-1', 'S02'], ['comment-0', 'C01'], ['desc-0', 'D01']]);
  assert.equal(
    renderBundle(bundle),
    ['[S01 00:00] boil the eggs for 7 minutes', '[S02 01:05] then 2 tbsp soy sauce', '[D01 설명] soy sauce 2 tbsp', '[C01 고정 댓글] eggs 4'].join('\n'),
  );
});

test('a gold recipe becomes a chat example in the model output schema', () => {
  const { example, problems } = toTrainingExample(bundle, gold);
  assert.deepEqual(problems, []);
  const [system, user, assistant] = example.messages;
  assert.equal(system.content, SYSTEM_PROMPT);
  assert.match(user.content, /^Video title: Soy garlic eggs\nChannel: Sample Kitchen\n\nEvidence:\n\[S01 00:00\]/);
  const answer = JSON.parse(assistant.content);
  assert.deepEqual(Object.keys(answer).sort(), Object.keys(RECIPE_SCHEMA.properties).sort());
  assert.deepEqual(answer.ingredients[0].amounts, [{ text: '4', evidence: ['C01'] }]);
  assert.deepEqual(answer.ingredients[1].amounts, [{ text: '2 tbsp', evidence: ['S02', 'D01'] }]);
  assert.deepEqual(answer.ingredients[1].evidence, ['S02', 'D01']); // the title is not evidence
  assert.deepEqual(answer.ingredients[2].amounts, []);
  assert.deepEqual(answer.steps.map((s) => s.text), ['Boil the eggs for 7 minutes.', 'Add soy sauce.']);
});

test('problems are reported instead of producing a wrong example', () => {
  const bad = structuredClone(gold);
  bad.ingredients[0].amount_raw = '4 large';
  bad.steps[0].evidence = ['asr-9'];
  const { problems } = toTrainingExample(bundle, bad);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /amount "4 large" is not in its evidence text/);
  assert.match(problems[1], /evidence asr-9 is not in the bundle/);
});
