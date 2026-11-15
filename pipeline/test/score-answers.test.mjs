import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer, score, summarize } from '../scripts/score-answers.mjs';

const ing = (name, amount) => ({ name, amounts: amount ? [{ text: amount, evidence: ['S01'] }] : [], evidence: ['S01'], is_group_header: false });
const gold = { ingredients: [ing('간장', '2스푼'), ing('설탕', '1스푼'), ing('깨')], steps: [{ text: 'a', evidence: ['S01'] }, { text: 'b', evidence: ['S02'] }] };

test('score matches names, compares amounts and counts misses and extras', () => {
  const pred = { ingredients: [ing('진간장', '2 스푼'), ing('깨', '약간'), ing('파')], steps: [{ text: 'a', evidence: ['S01'] }] };
  const s = score(gold, pred);
  assert.equal(s.ing_matched, 2);
  assert.equal(s.ing_pred, 3);
  assert.equal(s.amount_gold, 2);
  assert.equal(s.amount_hit, 1);
  assert.equal(s.amount_extra, 1);
  assert.deepEqual([s.steps_gold, s.steps_pred], [2, 1]);
});

test('parseAnswer reads fenced or wrapped JSON and gives up on broken text', () => {
  assert.deepEqual(parseAnswer('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseAnswer('Here: {"a":1} done'), { a: 1 });
  assert.equal(parseAnswer('{"a":'), null);
  assert.equal(parseAnswer(null), null);
});

test('summarize pools counts over cases and keeps failures out of the rates', () => {
  const s = summarize([score(gold, gold), { failed: 1 }]);
  assert.equal(s.failed, 1);
  assert.equal(s.ing_recall, 1);
  assert.equal(s.amount_exact, 1);
});
