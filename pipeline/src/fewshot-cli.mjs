#!/usr/bin/env node
// Builds the few-shot example index from a training JSONL (src/train-cli.mjs output).
//   node src/fewshot-cli.mjs train.jsonl --out fewshot-index.json [--report train-report.csv]
// --report (train-cli's report) names each example by its case, so meta.fewshot_examples says which ones were used.
// Calls OpenAI embeddings (OPENAI_API_KEY, a few cents). The index holds other people's captions: keep it outside the repo.
import { readFileSync } from 'node:fs';
import { buildIndex, writeIndex } from './fewshot.mjs';

const args = process.argv.slice(2);
const take = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args.splice(i, 2)[1];
};
const out = take('--out');
const report = take('--report');
const [input] = args;
if (!input || !out) {
  console.error('usage: node src/fewshot-cli.mjs train.jsonl --out fewshot-index.json [--report train-report.csv]');
  process.exit(2);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set.');
  process.exit(2);
}

// The JSONL holds the report's included rows in order, minus the held-out ones (picked the way train-cli picks them).
const text = readFileSync(input, 'utf8');
const lines = text.split('\n').filter((l) => l.trim()).length;
let ids = [];
if (report) {
  const rows = readFileSync(report, 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1).filter(Boolean).map((r) => r.split(','));
  const kept = rows.filter((r) => r[2] === 'yes').map((r) => r[0]);
  const holdout = kept.length - lines;
  const val = new Set();
  for (let k = 0; k < holdout; k++) val.add(Math.floor(((k + 0.5) * kept.length) / holdout));
  ids = kept.filter((_, i) => !val.has(i));
  if (ids.length !== lines) {
    console.error(`--report has ${kept.length} included cases, which does not match ${lines} lines; examples are numbered instead.`);
    ids = [];
  }
}
const index = await buildIndex(text, { apiKey: process.env.OPENAI_API_KEY, ids });
await writeIndex(out, index);
console.log(`${index.examples.length} examples -> ${out} (${index.model})`);
