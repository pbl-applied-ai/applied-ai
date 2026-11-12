import { formatClock } from './segments.mjs';
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from './schema.mjs';

// Gold data (evidence bundle + gold recipe, schemas v0.1 or v0.2) -> one fine-tuning example in the exact shape
// the pipeline sends at stage 5: the same system prompt, the same user prompt and the same evidence IDs
// (S01/D01/C01), with the answer in the model's output schema (RECIPE_SCHEMA).

const PREFIX = { asr: 'S', description: 'D', comment: 'C' };
const TEAM_TYPE = { asr: 'asr', desc: 'description', comment: 'comment' };
const UNTIMED_LABEL = { description: '설명', comment: '고정 댓글' };
const pad = (n, total) => String(n).padStart(Math.max(2, String(total).length), '0');

// Bundle segment IDs (asr-0, desc-0, comment-0) -> the IDs the model sees. The title is in the prompt header,
// not an evidence line, so title-N maps to nothing.
export function modelIdMap(bundle) {
  const segs = bundle.segments.filter((s) => PREFIX[s.type]);
  const counts = {};
  for (const s of segs) counts[s.type] = (counts[s.type] ?? 0) + 1;
  const seen = {};
  const map = new Map();
  for (const s of segs) {
    seen[s.type] = (seen[s.type] ?? 0) + 1;
    map.set(s.id, `${PREFIX[s.type]}${pad(seen[s.type], counts[s.type])}`);
  }
  return map;
}

// Same order and labels as the pipeline: speech, then description, then pinned comment.
export function renderBundle(bundle, map = modelIdMap(bundle)) {
  const order = { asr: 0, description: 1, comment: 2 };
  return bundle.segments
    .filter((s) => map.has(s.id))
    .sort((a, b) => order[a.type] - order[b.type])
    .map((s) => (UNTIMED_LABEL[s.type] ? `[${map.get(s.id)} ${UNTIMED_LABEL[s.type]}] ${s.text}` : `[${map.get(s.id)} ${formatClock(s.start_ms ?? 0)}] ${s.text}`))
    .join('\n');
}

const squash = (s) => s.replace(/\s+/g, '').toLowerCase();

// The gold recipe follows the video; the training answer holds only what the model can see in the evidence.
// So an ingredient or step with no citable evidence is left out of the answer, and an amount that is not in its
// evidence text (fixed by watching the video, e.g. a misheard caption) becomes no amount. Each such change is listed
// in notes; problems (a broken file) leave the whole case out.
export function toTrainingExample(bundle, gold) {
  const problems = [];
  const notes = [];
  if (bundle.video_id !== gold.video_id) problems.push(`video_id differs: bundle ${bundle.video_id}, gold ${gold.video_id}`);
  const map = modelIdMap(bundle);
  const text = new Map(bundle.segments.map((s) => [s.id, s.text]));
  const known = new Set(bundle.segments.map((s) => s.id));
  const order = bundle.segments.map((s) => s.id);
  const ids = (refs, label) => {
    for (const r of refs ?? []) if (!known.has(r)) problems.push(`${label}: evidence ${r} is not in the bundle`);
    return [...new Set((refs ?? []).map((r) => map.get(r)).filter(Boolean))];
  };
  const ingredients = [];
  gold.ingredients.forEach((ing, i) => {
    const label = ing.id ?? `ingredient ${i + 1}`;
    const evidence = ids(ing.evidence, label);
    if (!evidence.length) {
      notes.push(`${label} ${ing.name}: no evidence the model can cite, left out of the answer`);
      return;
    }
    let amounts = [];
    if (ing.amount_status === 'confirmed' && ing.amount_raw) {
      // The amount cites the lines that contain it. Speech captions often split an amount ("소금 반" + "스푼 정도"),
      // so two cited lines in a row that hold it together are cited as a pair.
      const amt = squash(ing.amount_raw);
      const cited = (ing.evidence ?? []).filter((r) => map.has(r));
      let where = cited.filter((r) => squash(text.get(r) ?? '').includes(amt));
      if (!where.length) {
        const sorted = [...cited].sort((a, b) => order.indexOf(a) - order.indexOf(b));
        const pair = sorted.findIndex(
          (r, j) => j + 1 < sorted.length && order.indexOf(sorted[j + 1]) === order.indexOf(r) + 1 && squash(`${text.get(r)}${text.get(sorted[j + 1])}`).includes(amt),
        );
        if (pair !== -1) where = [sorted[pair], sorted[pair + 1]];
      }
      if (where.length) amounts = [{ text: ing.amount_raw, evidence: where.map((r) => map.get(r)) }];
      else notes.push(`${label} ${ing.name}: amount "${ing.amount_raw}" is not in its evidence text, answer has no amount`);
    }
    ingredients.push({ name: ing.name, preparation: null, amounts, evidence, is_group_header: false });
  });
  const steps = [];
  [...gold.steps]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .forEach((s, i) => {
      const label = s.id ?? `step ${i + 1}`;
      const evidence = ids(s.evidence, label);
      if (!evidence.length) notes.push(`${label}: no evidence the model can cite, left out of the answer`);
      else steps.push({ text: s.text, evidence, is_group_header: false });
    });
  if (!ingredients.length || !steps.length) problems.push(`${ingredients.length} ingredients and ${steps.length} steps with evidence, nothing to learn from`);
  const answer = {
    not_a_recipe: false,
    title: gold.title,
    servings: gold.servings_raw ?? null,
    servings_evidence: [],
    ingredients,
    steps,
    tips: [],
  };
  const video = { title: bundle.source?.title ?? null, author: bundle.source?.channel ?? null };
  return {
    example: {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(video, renderBundle(bundle, map)) },
        { role: 'assistant', content: JSON.stringify(answer) },
      ],
    },
    meta: { video_id: gold.video_id, channel: bundle.source?.channel ?? null, prompt_version: PROMPT_VERSION, ingredients: ingredients.length, steps: steps.length },
    problems,
    notes,
  };
}
