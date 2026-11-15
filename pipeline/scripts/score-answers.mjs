#!/usr/bin/env node
// Scores model answers against the gold answers in a prompts file, per condition and language.
//   node scripts/score-answers.mjs prompts.jsonl answers-a.jsonl [answers-b.jsonl ...] [--out scores.json]
// prompts.jsonl: { case, lang, messages: [system, user, assistant=gold answer] } per line (training JSONL shape).
// answers: { case, cond, text } per line, text = the model's JSON answer (gpt-4.1 runs or an open model in Colab).
// Same answer shape as fine-tuning (src/train-data.mjs), so every model is scored the same way. No LLM calls.
// Prompts and answers hold other people's captions: keep them outside the repo.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const norm = (s) => String(s ?? '').normalize('NFKC').replace(/[\s()\[\]·,.\-]/g, '').toLowerCase();
const amountOf = (ing) => ing.amounts?.[0]?.text ?? null;

export function score(expected, pred) {
  const gold = expected.ingredients.filter((i) => !i.is_group_header);
  const got = (pred.ingredients ?? []).filter((i) => !i.is_group_header);
  const used = new Set();
  let matched = 0;
  let amountGold = 0;
  let amountHit = 0;
  let amountExtra = 0;
  let amountMissed = 0;
  for (const g of gold) {
    const gn = norm(g.name);
    let j = got.findIndex((p, k) => !used.has(k) && norm(p.name) === gn);
    if (j === -1) j = got.findIndex((p, k) => !used.has(k) && norm(p.name) && (norm(p.name).includes(gn) || gn.includes(norm(p.name))));
    const ga = amountOf(g);
    if (ga) amountGold++;
    if (j === -1) continue;
    used.add(j);
    matched++;
    const pa = amountOf(got[j]);
    if (ga && pa && norm(ga) === norm(pa)) amountHit++;
    else if (ga && !pa) amountMissed++;
    else if (!ga && pa) amountExtra++;
  }
  return {
    ing_gold: gold.length,
    ing_pred: got.length,
    ing_matched: matched,
    ing_recall: gold.length ? matched / gold.length : 1,
    ing_precision: got.length ? matched / got.length : 0,
    amount_gold: amountGold,
    amount_hit: amountHit,
    amount_missed: amountMissed,
    amount_extra: amountExtra,
    steps_gold: expected.steps.filter((s) => !s.is_group_header).length,
    steps_pred: (pred.steps ?? []).filter((s) => !s.is_group_header).length,
  };
}

// A model that is not held to a JSON schema may wrap its answer in a code fence or add text around it.
export function parseAnswer(text) {
  if (text == null) return null;
  const t = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  for (const s of [t, t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)]) {
    try {
      const v = JSON.parse(s);
      if (v && typeof v === 'object') return v;
    } catch {}
  }
  return null;
}

export function summarize(rows) {
  const sum = (k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
  const ok = rows.filter((r) => !r.failed);
  const total = (k) => ok.reduce((a, r) => a + r[k], 0);
  return {
    cases: rows.length,
    failed: sum('failed'),
    ing_recall: total('ing_matched') / (total('ing_gold') || 1),
    ing_precision: total('ing_matched') / (total('ing_pred') || 1),
    amount_exact: total('amount_hit') / (total('amount_gold') || 1),
    amount_missed: total('amount_missed'),
    amount_extra: total('amount_extra'),
    steps_gold: total('steps_gold'),
    steps_pred: total('steps_pred'),
  };
}

const main = () => {
  const args = process.argv.slice(2);
  const o = args.indexOf('--out');
  const out = o === -1 ? null : args.splice(o, 2)[1];
  const [promptsFile, ...answerFiles] = args;
  if (!promptsFile || !answerFiles.length) {
    console.error('usage: node scripts/score-answers.mjs prompts.jsonl answers.jsonl... [--out scores.json]');
    process.exit(2);
  }
  const lines = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const gold = new Map(lines(promptsFile).map((p) => [p.case, { lang: p.lang, answer: JSON.parse(p.messages.at(-1).content) }]));
  const rows = [];
  for (const a of answerFiles.flatMap(lines)) {
    const g = gold.get(a.case);
    if (!g) continue;
    const pred = parseAnswer(a.text);
    rows.push({ case: a.case, cond: a.cond, lang: g.lang, ...(pred ? score(g.answer, pred) : { failed: 1 }) });
  }
  const groups = {};
  for (const r of rows) for (const key of [`${r.cond} all`, `${r.cond} ${r.lang}`]) (groups[key] ??= []).push(r);
  const table = Object.fromEntries(Object.entries(groups).sort().map(([k, v]) => [k, summarize(v)]));
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.log('condition         cases fail  ing recall  ing precision  amount exact  missed extra  steps pred/gold');
  for (const [k, s] of Object.entries(table)) {
    console.log(`${k.padEnd(17)} ${String(s.cases).padStart(5)} ${String(s.failed).padStart(4)}  ${pct(s.ing_recall).padStart(10)}  ${pct(s.ing_precision).padStart(13)}  ${pct(s.amount_exact).padStart(12)}  ${String(s.amount_missed).padStart(6)} ${String(s.amount_extra).padStart(5)}  ${s.steps_pred}/${s.steps_gold}`);
  }
  if (out) writeFileSync(out, JSON.stringify({ table, rows }, null, 2));
};
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
