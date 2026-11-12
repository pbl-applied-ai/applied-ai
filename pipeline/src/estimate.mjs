// Suggested amounts for ingredients the video never gives (KAN-52). A separate call after extraction, so the
// extraction prompt (v7) and its scores stay as they are. A suggestion never becomes a video amount:
// amount_status is untouched and the suggestion goes to its own field, shown as "추정".
import { callStructured, resolveProvider } from './llm.mjs';

export const ESTIMATE_PROMPT_VERSION = 'amount-estimate-v1';

// On unless AMOUNT_ESTIMATE=off (e.g. to compare extraction alone, or to save the extra call).
export const estimateEnabled = (env = process.env) => env.AMOUNT_ESTIMATE?.trim().toLowerCase() !== 'off';

const MAX_TEXT = 30;
const MAX_BASIS = 60;

const ESTIMATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['estimates'],
  properties: {
    estimates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'amount', 'basis'],
        properties: {
          number: { type: 'integer', description: 'The number of the ingredient in the list.' },
          amount: { type: ['string', 'null'], description: 'Suggested amount, or null when there is no sensible guess.' },
          basis: { type: 'string', description: 'A few words on what the guess assumes.' },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You suggest amounts for the ingredients of a recipe whose amounts the cooking video never stated.
The app shows each suggestion labelled "추정" (estimate), apart from amounts that came from the video, and the user decides whether to use it.

- Suggest only for the numbered ingredients marked "(amount unknown)". Never change or repeat the amounts the video gave.
- Base each guess on the dish, the stated servings, the amounts that are known, and the steps. Keep the guesses consistent with the known amounts (a seasoning for 2 servings stays in proportion to the other seasonings).
- Write the amount the way a home cook would, in the recipe's language and its units (Korean: 1큰술, 1/2작은술, 200ml, 1개, 한 줌, 약간).
- Use null when a guess would not help: water or oil for boiling or deep-frying, garnish to taste, or anything you cannot judge.
- basis is a few words in the recipe's language, e.g. "2인분 찌개 기준".`;

// The ingredients worth a suggestion: not group headers, and no amount confirmed from the video.
export const unknownAmounts = (recipe) =>
  recipe.ingredients.filter((ing) => !ing.is_group_header && ing.amount_status !== 'confirmed');

export function buildEstimatePrompt(recipe) {
  const items = recipe.ingredients.filter((ing) => !ing.is_group_header);
  const lines = items.map((ing, i) => {
    const amount = ing.amount_status === 'confirmed' ? ing.amount_text : '(amount unknown)';
    return `${i + 1}. ${ing.name}${ing.preparation ? ` (${ing.preparation})` : ''}: ${amount}`;
  });
  const steps = recipe.steps.filter((s) => !s.is_group_header).map((s, i) => `${i + 1}. ${s.text}`);
  return [
    `Dish: ${recipe.title}`,
    `Servings: ${recipe.servings_text ?? '(not stated)'}`,
    '',
    'Ingredients:',
    ...lines,
    '',
    'Steps:',
    ...steps,
  ].join('\n');
}

const clip = (value, max) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= max ? text : null;
};

// Puts each usable suggestion on its ingredient as amount_estimate. Anything else in the reply is dropped.
export function applyEstimates(recipe, data) {
  const items = recipe.ingredients.filter((ing) => !ing.is_group_header);
  let applied = 0;
  for (const entry of data?.estimates ?? []) {
    const ing = items[Number(entry?.number) - 1];
    const text = clip(entry?.amount, MAX_TEXT);
    if (!ing || ing.amount_status === 'confirmed' || ing.amount_estimate || !text) continue;
    ing.amount_estimate = { text, basis: clip(entry.basis, MAX_BASIS) };
    applied++;
  }
  return applied;
}

// Never fails the recipe: without a suggestion the amount just stays blank, as it did before.
export async function estimateAmounts(recipe, { env = process.env, fetchImpl = fetch, estimateOutput } = {}) {
  if (recipe.status !== 'ok' || !unknownAmounts(recipe).length) return { applied: 0, usage: null };
  try {
    const out = estimateOutput
      ? { data: estimateOutput, usage: null }
      : await callStructured(resolveProvider(env), { name: 'suggest_amounts', system: SYSTEM_PROMPT, schema: ESTIMATE_SCHEMA, user: buildEstimatePrompt(recipe) }, { fetchImpl });
    return { applied: applyEstimates(recipe, out.data), usage: out.usage };
  } catch (err) {
    recipe.warnings.push(`amount estimate skipped: ${err?.message ?? err}`);
    return { applied: 0, usage: null };
  }
}
