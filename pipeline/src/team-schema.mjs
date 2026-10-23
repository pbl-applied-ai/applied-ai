import { PROMPT_VERSION } from './schema.mjs';

export const TEAM_SCHEMA_VERSION = '0.1';

// Internal evidence IDs (S01, D01) become team IDs (asr-0, desc-0). Platform captions map to
// "asr" because the team schema has no separate caption type yet.
export function teamIdMap(evidence) {
  const map = new Map();
  let asr = 0;
  let desc = 0;
  for (const seg of evidence) map.set(seg.id, seg.kind === 'description' ? `desc-${desc++}` : `asr-${asr++}`);
  return map;
}

const toTeamIds = (refs, map) => [...new Set(refs.map((r) => map.get(r.segment_id)).filter(Boolean))];

// Pipeline result -> schemas/evidence_bundle.schema.json
export function toEvidenceBundle(result, { runId, createdAt } = {}) {
  const map = teamIdMap(result.evidence);
  const { source, meta } = result;
  const segments = [];
  if (source.title) segments.push({ id: 'title-0', type: 'title', text: source.title });
  for (const seg of result.evidence) {
    const id = map.get(seg.id);
    if (seg.kind === 'description') segments.push({ id, type: 'description', text: seg.text });
    else segments.push({ id, type: 'asr', start_ms: seg.startMs, end_ms: seg.endMs, text: seg.text });
  }
  return {
    schema_version: TEAM_SCHEMA_VERSION,
    video_id: source.videoId,
    source: {
      kind: 'youtube_shorts',
      url: source.source_url ?? `https://www.youtube.com/shorts/${source.videoId}`,
      ...(source.title && { title: source.title }),
      ...(source.author && { channel: source.author }),
      ...(source.durationMs != null && { duration_ms: source.durationMs }),
    },
    run: {
      run_id: runId ?? `${source.videoId}-${meta.generated_at}`,
      created_at: createdAt ?? meta.generated_at,
      stages: {
        captions: { tool: 'youtube-timedtext', version: source.caption?.client ?? 'unknown' },
        structure: { tool: meta.model ?? 'saved-llm-output', version: meta.prompt_version ?? PROMPT_VERSION },
      },
    },
    segments,
  };
}

// Pipeline result -> schemas/recipe.schema.json, or null when there is no recipe to save
// (not_a_recipe, insufficient), since the team schema needs at least one ingredient and step.
// Only amounts the pipeline confirmed keep their text; needs_review, conflict and not_in_video
// all become unconfirmed with an empty amount.
export function toTeamRecipe(result) {
  const { recipe } = result;
  if (recipe.status !== 'ok') return null;
  const map = teamIdMap(result.evidence);
  const ingredients = recipe.ingredients
    .filter((ing) => !ing.is_group_header)
    .map((ing) => {
      const confirmed = ing.amount_status === 'confirmed';
      return {
        name: ing.name,
        amount_raw: confirmed ? ing.amount_text : null,
        amount_status: confirmed ? 'confirmed' : 'unconfirmed',
        evidence: toTeamIds([...ing.evidence, ...(confirmed ? ing.amounts.flatMap((a) => a.evidence) : [])], map),
      };
    });
  const steps = recipe.steps
    .filter((s) => !s.is_group_header)
    .map((s, i) => ({ order: i + 1, text: s.text, evidence: toTeamIds(s.evidence, map) }));
  if (!ingredients.length || !steps.length) return null;
  return {
    schema_version: TEAM_SCHEMA_VERSION,
    video_id: result.source.videoId,
    title: recipe.title,
    servings_raw: recipe.servings_text,
    ingredients,
    steps,
  };
}
