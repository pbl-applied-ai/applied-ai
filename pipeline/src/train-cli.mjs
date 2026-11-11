#!/usr/bin/env node
// Builds a fine-tuning JSONL from gold folders (each with bundle.json and gold.json or recipe.json).
//   node src/train-cli.mjs <folder or parent folder>... --out train.jsonl [--report report.csv] [--exclude T-041,T-050]
// A case with problems (evidence missing from the bundle, an amount not in its text) is left out and listed.
// Gold data holds other people's captions, so keep the output outside the public repo.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { toTrainingExample } from './train-data.mjs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const [v] = args.splice(i, 2).slice(1);
  return v;
};
const out = opt('--out');
const report = opt('--report');
const exclude = new Set((opt('--exclude') ?? '').split(',').filter(Boolean));
if (!out || !args.length) {
  console.error('usage: node src/train-cli.mjs <folder>... --out train.jsonl [--report report.csv] [--exclude T-041,...]');
  process.exit(2);
}

const goldFile = (dir) => ['gold.json', 'recipe.json'].map((f) => join(dir, f)).find(existsSync);
function caseDirs(dir) {
  if (existsSync(join(dir, 'bundle.json')) && goldFile(dir)) return [dir];
  return readdirSync(dir)
    .map((n) => join(dir, n))
    .filter((p) => statSync(p).isDirectory())
    .flatMap(caseDirs);
}

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const lines = [];
const rows = [['case', 'video_id', 'included', 'ingredients', 'steps', 'problems']];
const seen = new Set();
for (const dir of args.flatMap(caseDirs)) {
  const name = basename(dir);
  if (exclude.has(name)) {
    rows.push([name, '', 'excluded', '', '', 'excluded by --exclude']);
    continue;
  }
  const { example, meta, problems } = toTrainingExample(read(join(dir, 'bundle.json')), read(goldFile(dir)));
  if (seen.has(meta.video_id)) problems.push('same video already included');
  seen.add(meta.video_id);
  if (!problems.length) lines.push(JSON.stringify(example));
  rows.push([name, meta.video_id, problems.length ? 'no' : 'yes', meta.ingredients, meta.steps, problems.join(' | ')]);
}
writeFileSync(out, lines.length ? `${lines.join('\n')}\n` : '');
const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
if (report) writeFileSync(report, `﻿${rows.map((r) => r.map(csv).join(',')).join('\r\n')}\r\n`);
const left = rows.slice(1).filter((r) => r[2] !== 'yes');
console.log(`${lines.length} examples -> ${out}; ${left.length} left out`);
for (const r of left) console.log(`  ${r[0]} ${r[1]}: ${r[5]}`);
