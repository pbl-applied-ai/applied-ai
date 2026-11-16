import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchIngredients, normAmount, normName, parseAnswer, score, summarize } from '../scripts/score-answers.mjs';

const ing = (name, amount, evidence = ['S01']) => ({ name, amounts: amount ? [{ text: amount, evidence }] : [], evidence, is_group_header: false });
const gold = { ingredients: [ing('간장', '2스푼'), ing('설탕', '1스푼'), ing('깨')], steps: [{ text: 'a', evidence: ['S01'] }, { text: 'b', evidence: ['S02'] }] };
const recipe = (...ingredients) => ({ ingredients, steps: [] });

test('score matches names, compares amounts and counts misses and extras', () => {
  const pred = { ingredients: [ing('간장', '2 스푼'), ing('깨', '약간'), ing('파')], steps: [{ text: 'a', evidence: ['S01'] }] };
  const s = score(gold, pred);
  assert.equal(s.ing_matched, 2);
  assert.equal(s.ing_pred, 3);
  assert.equal(s.amount_gold, 2);
  assert.equal(s.amount_hit, 1);
  assert.equal(s.amount_extra, 1);
  assert.deepEqual([s.steps_gold, s.steps_pred], [2, 1]);
});

test('amounts are compared like evaluate.py norm_amount: marks kept, T and t apart, other case ignored (#58 review)', () => {
  assert.notEqual(normAmount('1.5큰술'), normAmount('15큰술'));
  assert.notEqual(normAmount('1-2개'), normAmount('12개'));
  assert.notEqual(normAmount('1T'), normAmount('1t'));
  assert.notEqual(normAmount('½T'), normAmount('½t'));
  assert.equal(normAmount('1T'), normAmount('1 T'));
  assert.equal(normAmount('2 Tbsp'), normAmount('2 tbsp'));
  assert.equal(normName('Black Pepper (ground)'), normName('black pepper'));
  const s = score(recipe(ing('간장', '1T')), recipe(ing('간장', '1t')));
  assert.deepEqual([s.ing_matched, s.amount_hit], [1, 0]);
});

test('names pair exactly or through eval_synonyms.json, never by containment (#58 review)', () => {
  const s = score(recipe(ing('간장'), ing('소금'), ing('대파')), recipe(ing('진간장'), ing('소금물'), ing('파')));
  assert.equal(s.ing_matched, 1); // 파 → 대파 only
});

test('several rows of one name pair by amount, then cited segment, then order (#55)', () => {
  const g = recipe(ing('black pepper', '1 tsp', ['S01']), ing('black pepper', '1/2 tsp', ['S02']), ing('black pepper', 'to taste', ['S03']));
  const reversed = recipe(ing('black pepper', 'to taste', ['S03']), ing('black pepper', '1/2 tsp', ['S02']), ing('black pepper', '1 tsp', ['S01']));
  assert.deepEqual([score(g, reversed).ing_matched, score(g, reversed).amount_hit], [3, 3]);
  // One row only: it pairs with the gold row it matches, not the first one
  assert.equal(score(g, recipe(ing('black pepper', '1/2 tsp', ['S02']))).amount_hit, 1);
  // No amount: the cited segment decides
  assert.deepEqual(matchIngredients([ing('salt', '1 tsp', ['S01']), ing('salt', '2 tsp', ['S02'])], [ing('salt', null, ['S02'])], new Map()), [[1, 0]]);
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
