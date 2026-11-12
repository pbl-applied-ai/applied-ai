#!/usr/bin/env node
// Builds a fine-tuning JSONL from gold folders (each with bundle.json and gold.json or recipe.json).
//   node src/train-cli.mjs <folder or parent folder>... --out train.jsonl [--report report.csv]
//     [--holdout 10 --holdout-out val.jsonl] [--not-in <eval or dev gold folder>]... [--exclude T-041,T-050]
// --not-in leaves out a case whose video or channel is in those folders (the eval set and dev videos), so the
// fine-tuned score is not inflated by videos or channel formats it was trained on (docs/eval-set.md section 5).
// A case with problems (evidence missing from the bundle) is left out; smaller changes are listed as notes.
// Gold data holds other people's captions, so keep the output outside the public repo.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { toTrainingExample } from './train-data.mjs';

const args = process.argv.slice(2);
const take = (name, many = false) => {
  const found = [];
  for (let i = args.indexOf(name); i !== -1; i = args.indexOf(name)) found.push(args.splice(i, 2)[1]);
  return many ? found : (found.at(-1) ?? null);
};
const out = take('--out');
const report = take('--report');
const holdout = Number(take('--holdout') ?? 0);
const holdoutOut = take('--holdout-out');
const notIn = take('--not-in', true);
const exclude = new Set((take('--exclude') ?? '').split(',').filter(Boolean));
if (!out || !args.length || (holdout && !holdoutOut)) {
  console.error('usage: node src/train-cli.mjs <folder>... --out train.jsonl [--report report.csv] [--holdout N --holdout-out val.jsonl] [--not-in <folder>]... [--exclude T-041,...]');
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
const channelKey = (c) => (c ?? '').toLowerCase().replace(/\s+/g, '');

const blockedVideos = new Set();
const blockedChannels = new Set();
for (const dir of notIn.flatMap(caseDirs)) {
  const b = read(join(dir, 'bundle.json'));
  blockedVideos.add(b.video_id);
  if (b.source?.channel) blockedChannels.add(channelKey(b.source.channel));
}

const kept = [];
const rows = [['case', 'video_id', 'included', 'ingredients', 'steps', 'problems', 'notes']];
const seen = new Set();
for (const dir of args.flatMap(caseDirs)) {
  const name = basename(dir);
  if (exclude.has(name)) {
    rows.push([name, '', 'no', '', '', 'excluded by --exclude', '']);
    continue;
  }
  const { example, meta, problems, notes } = toTrainingExample(read(join(dir, 'bundle.json')), read(goldFile(dir)));
  if (seen.has(meta.video_id)) problems.push('same video already included');
  if (blockedVideos.has(meta.video_id)) problems.push('video is in a --not-in set');
  else if (meta.channel && blockedChannels.has(channelKey(meta.channel))) problems.push(`channel ${meta.channel} is in a --not-in set`);
  seen.add(meta.video_id);
  if (!problems.length) kept.push(JSON.stringify(example));
  rows.push([name, meta.video_id, problems.length ? 'no' : 'yes', meta.ingredients, meta.steps, problems.join(' | '), notes.join(' | ')]);
}

// The held-out cases are spread evenly over the list so every contributor and platform is represented.
const valIdx = new Set();
for (let k = 0; k < Math.min(holdout, kept.length); k++) valIdx.add(Math.floor(((k + 0.5) * kept.length) / holdout));
const write = (file, lines) => writeFileSync(file, lines.length ? `${lines.join('\n')}\n` : '');
write(out, kept.filter((_, i) => !valIdx.has(i)));
if (holdoutOut) write(holdoutOut, kept.filter((_, i) => valIdx.has(i)));

const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
if (report) writeFileSync(report, `﻿${rows.map((r) => r.map(csv).join(',')).join('\r\n')}\r\n`);
const body = rows.slice(1);
console.log(`${kept.length - valIdx.size} train -> ${out}${holdoutOut ? `, ${valIdx.size} held out -> ${holdoutOut}` : ''}; ${body.filter((r) => r[2] !== 'yes').length} left out, ${body.filter((r) => r[6]).length} with notes`);
for (const r of body.filter((x) => x[2] !== 'yes')) console.log(`  left out ${r[0]} ${r[1]}: ${r[5]}`);
for (const r of body.filter((x) => x[2] === 'yes' && x[6])) console.log(`  note ${r[0]}: ${r[6]}`);
