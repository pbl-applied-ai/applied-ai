// Suggested amounts (KAN-52): only for unconfirmed items, never a video amount, never a failed recipe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyEstimates, buildEstimatePrompt, estimateAmounts, unknownAmounts } from '../src/estimate.mjs';
import { extractorVersion, runJob } from '../src/job.mjs';
import { toTeamRecipe } from '../src/team-schema.mjs';

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const llmFixture = JSON.parse(readFileSync(fixture('sample-gochujang-bowl.llm.json'), 'utf8'));
const TRANSCRIPT = fileURLToPathString(fixture('sample-gochujang-bowl.transcript.json'));
const ENV = { OPENAI_API_KEY: 'test-key', LLM_PROVIDER: 'openai' };

function fileURLToPathString(url) {
  return decodeURIComponent(url.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
}

const recipe = () => ({
  status: 'ok',
  title: '고추장 찌개',
  servings_text: '2인분',
  warnings: [],
  ingredients: [
    { name: '양념', is_group_header: true, amount_status: 'not_in_video' },
    { name: '고추장', preparation: null, amount_text: '2큰술', amount_status: 'confirmed', is_group_header: false },
    { name: '설탕', preparation: null, amount_text: null, amount_status: 'not_in_video', is_group_header: false },
    { name: '소금', preparation: null, amount_text: '조금', amount_status: 'conflict', is_group_header: false },
  ],
  steps: [{ text: '끓인다', is_group_header: false }],
});

test('the prompt numbers items without group headers and marks only unknown amounts', () => {
  const prompt = buildEstimatePrompt(recipe());
  assert.match(prompt, /1\. 고추장: 2큰술/);
  assert.match(prompt, /2\. 설탕: \(amount unknown\)/);
  assert.match(prompt, /3\. 소금: \(amount unknown\)/);
  assert.doesNotMatch(prompt, /양념/);
  assert.deepEqual(unknownAmounts(recipe()).map((i) => i.name), ['설탕', '소금']);
});

test('suggestions land only on unknown amounts and drop anything unusable', () => {
  const r = recipe();
  const applied = applyEstimates(r, {
    estimates: [
      { number: 1, amount: '5큰술', basis: '덮어쓰기 시도' },
      { number: 2, amount: ' 1큰술 ', basis: '2인분 기준' },
      { number: 3, amount: null, basis: '판단 어려움' },
      { number: 9, amount: '1개', basis: '없는 번호' },
      { number: 2, amount: '2큰술', basis: '두 번째 답' },
    ],
  });
  assert.equal(applied, 1);
  assert.equal(r.ingredients[1].amount_estimate, undefined, 'a video amount is never replaced');
  assert.deepEqual(r.ingredients[2].amount_estimate, { text: '1큰술', basis: '2인분 기준' });
  assert.equal(r.ingredients[3].amount_estimate, undefined);
  assert.equal(r.ingredients[2].amount_status, 'not_in_video', 'the status stays as validated');
});

test('a failed or skipped estimate leaves the recipe as it was', async () => {
  const r = recipe();
  const out = await estimateAmounts(r, { env: ENV, fetchImpl: async () => new Response('{}', { status: 500 }) });
  assert.equal(out.applied, 0);
  assert.match(r.warnings[0], /amount estimate skipped/);
  let called = false;
  const known = { ...recipe(), ingredients: [recipe().ingredients[1]] };
  await estimateAmounts(known, { env: ENV, fetchImpl: async () => { called = true; } });
  assert.equal(called, false, 'no call when every amount came from the video');
});

test('the team recipe carries the suggestion only on unconfirmed items, with amount_raw still null', async () => {
  const out = await runJob({ source_url: 'https://www.youtube.com/shorts/Smpl0Gochu1' }, {
    env: ENV,
    transcriptFile: TRANSCRIPT,
    llmOutput: llmFixture,
    estimateOutput: { estimates: [] },
  });
  assert.equal(out.status, 'succeeded', out.message);
  const result = out.internal;
  const unknown = result.recipe.ingredients.filter((i) => !i.is_group_header && i.amount_status !== 'confirmed');
  assert.ok(unknown.length, 'the sample has an ingredient without a video amount');
  unknown[0].amount_estimate = { text: '약간', basis: '테스트' };
  const team = toTeamRecipe(result);
  const item = team.ingredients.find((i) => i.name === unknown[0].name);
  assert.deepEqual(item.amount_estimate, { text: '약간', basis: '테스트' });
  assert.equal(item.amount_raw, null);
  assert.equal(item.amount_status, 'unconfirmed');
  assert.ok(team.ingredients.filter((i) => i.amount_status === 'confirmed').every((i) => !('amount_estimate' in i)));
});

test('replaying a saved extraction makes no estimate call, and the version says whether estimates are on', async () => {
  const out = await runJob({ source_url: 'https://www.youtube.com/shorts/Smpl0Gochu1' }, {
    env: ENV,
    transcriptFile: TRANSCRIPT,
    llmOutput: llmFixture,
    fetchImpl: () => assert.fail('called the model'),
  });
  assert.equal(out.status, 'succeeded', out.message);
  assert.equal(out.internal.meta.estimate, undefined);
  assert.equal(extractorVersion(ENV).estimate, 'amount-estimate-v1');
  assert.equal(extractorVersion({ ...ENV, AMOUNT_ESTIMATE: 'off' }).estimate, undefined);
});
