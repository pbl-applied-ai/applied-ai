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

export function toTrainingExample(bundle, gold) {
  const problems = [];
  if (bundle.video_id !== gold.video_id) problems.push(`video_id differs: bundle ${bundle.video_id}, gold ${gold.video_id}`);
  const map = modelIdMap(bundle);
  const text = new Map(bundle.segments.map((s) => [s.id, s.text]));
  const known = new Set(bundle.segments.map((s) => s.id));
  const ids = (refs, label) => {
    for (const r of refs ?? []) if (!known.has(r)) problems.push(`${label}: evidence ${r} is not in the bundle`);
    return [...new Set((refs ?? []).map((r) => map.get(r)).filter(Boolean))];
  };
  const ingredients = gold.ingredients.map((ing, i) => {
    const label = ing.id ?? `ingredient ${i + 1}`;
    const evidence = ids(ing.evidence, label);
    let amounts = [];
    if (ing.amount_status === 'confirmed' && ing.amount_raw) {
      // The amount cites the lines that contain it; fall back to all of the ingredient's lines.
      const where = (ing.evidence ?? []).filter((r) => map.has(r) && squash(text.get(r) ?? '').includes(squash(ing.amount_raw)));
      if (!where.length) problems.push(`${label}: amount "${ing.amount_raw}" is not in its evidence text`);
      amounts = [{ text: ing.amount_raw, evidence: where.length ? where.map((r) => map.get(r)) : evidence }];
    }
    if (!evidence.length) problems.push(`${label}: no evidence the model can cite`);
    return { name: ing.name, preparation: null, amounts, evidence, is_group_header: false };
  });
  const steps = [...gold.steps]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s, i) => ({ text: s.text, evidence: ids(s.evidence, s.id ?? `step ${i + 1}`), is_group_header: false }));
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
    meta: { video_id: gold.video_id, prompt_version: PROMPT_VERSION, ingredients: ingredients.length, steps: steps.length },
    problems,
  };
}
