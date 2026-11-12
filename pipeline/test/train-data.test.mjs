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

test('an amount split across two captions in a row cites both', () => {
  const split = structuredClone(bundle);
  split.segments.splice(2, 1, { id: 'asr-1', type: 'asr', start_ms: 65000, end_ms: 66000, text: 'then 2' }, { id: 'asr-2', type: 'asr', start_ms: 66000, end_ms: 67000, text: 'tbsp soy sauce' });
  const g = structuredClone(gold);
  g.ingredients[1].evidence = ['asr-2', 'asr-1'];
  const { example, problems } = toTrainingExample(split, g);
  assert.deepEqual(problems, []);
  assert.deepEqual(JSON.parse(example.messages[2].content).ingredients[1].amounts, [{ text: '2 tbsp', evidence: ['S02', 'S03'] }]);
});

test('what the model cannot see is left out of the answer and noted', () => {
  const g = structuredClone(gold);
  g.ingredients[0].amount_raw = '4 large'; // fixed by watching the video, not in the caption
  g.ingredients.push({ id: 'ing-4', name: 'sesame', amount_raw: null, amount_status: 'unconfirmed', evidence: [] });
  g.steps.push({ id: 'step-3', order: 3, text: 'Sprinkle sesame.', evidence: [] });
  const { example, problems, notes } = toTrainingExample(bundle, g);
  assert.deepEqual(problems, []);
  const answer = JSON.parse(example.messages[2].content);
  assert.deepEqual(answer.ingredients[0].amounts, []);
  assert.deepEqual(answer.ingredients.map((i) => i.name), ['eggs', 'soy sauce', 'garlic']);
  assert.equal(answer.steps.length, 2);
  assert.equal(notes.length, 3);
  assert.match(notes[0], /amount "4 large" is not in its evidence text/);
  assert.match(notes[1], /ing-4 sesame: no evidence/);
  assert.match(notes[2], /step-3: no evidence/);
});

test('evidence missing from the bundle is a problem that leaves the case out', () => {
  const bad = structuredClone(gold);
  bad.steps[0].evidence = ['asr-9'];
  const { problems } = toTrainingExample(bundle, bad);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /evidence asr-9 is not in the bundle/);
});
