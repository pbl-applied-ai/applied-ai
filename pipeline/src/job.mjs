import { readFileSync } from 'node:fs';
import { PipelineError } from './errors.mjs';
import { resolveProvider } from './llm.mjs';
import { runPipeline } from './pipeline.mjs';
import { PROMPT_VERSION } from './schema.mjs';
import { toEvidenceBundle, toTeamRecipe } from './team-schema.mjs';
import { parseVideoId } from './youtube.mjs';

const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// Same video, same key, whatever link shape it came from. null when the link cannot be read.
export function canonicalKey(sourceUrl) {
  const videoId = typeof sourceUrl === 'string' ? parseVideoId(sourceUrl.trim()) : null;
  return videoId ? `youtube:${videoId}` : null;
}

// pipeline is the package version plus the pipeline/ tree hash (PIPELINE_TREE, from
// `git rev-parse HEAD:pipeline`), so only changes under pipeline/ invalidate the cache.
// Without it the version ends in +dev and the worker must not cache the run.
export function extractorVersion(env = process.env) {
  let model = null;
  try {
    const { provider, model: name } = resolveProvider(env);
    model = `${provider}:${name}`;
  } catch {
    // No key yet: the version is still useful for logs, and the run fails later with llm_config.
  }
  const tree = env.PIPELINE_TREE?.trim();
  return {
    pipeline: `${PACKAGE_VERSION}+${tree ? tree.slice(0, 7) : 'dev'}`,
    collector: 'youtube-timedtext',
    prompt: PROMPT_VERSION,
    model,
  };
}

export const isDevVersion = (version) => version.pipeline.endsWith('+dev');

function finalizeError(message, errorCode, reason) {
  return new PipelineError(message, { stage: 'finalize', errorCode, reason });
}

function exportRun(result, warnings, { partial = false } = {}) {
  const recipe = toTeamRecipe(result, warnings, { partial });
  if (!recipe) throw finalizeError(`Team schema export failed: ${warnings.at(-1)}`, 'internal', 'team_schema_invalid');
  return { bundle: toEvidenceBundle(result), recipe, internal: result };
}

// Runs one job and always resolves to a result object, never throws (docs/worker-interface.md v0.3).
// onStage gets { stage, state, reason?, ms? } as each stage starts and ends.
export async function runJob(input, { onStage = () => {}, env = process.env, fetchImpl = fetch, transcriptFile, llmOutput } = {}) {
  const key = canonicalKey(input.source_url);
  const stages = [];
  let current = null;
  let startedAt = 0;
  const report = (event) => {
    if (event.state === 'started') {
      current = event.stage;
      startedAt = Date.now();
    } else {
      stages.push(event);
    }
    try {
      onStage(event);
    } catch {
      // A failed progress write must not fail the recipe.
    }
  };
  const isOpen = () => current && !stages.some((s) => s.stage === current);
  let usage = null;
  let partial = null;

  try {
    if (!key && !transcriptFile) {
      report({ stage: 'collect', state: 'started' });
      throw new PipelineError(`Not a YouTube video URL: ${input.source_url}`, { stage: 'collect', errorCode: 'unsupported_source', reason: 'not_youtube' });
    }
    const result = await runPipeline({
      url: input.source_url,
      transcriptFile,
      languages: input.options?.languages,
      env,
      fetchImpl,
      llmOutput,
      onStage: report,
    });
    usage = result.meta.usage;

    // runPipeline left finalize open; the checks below decide how it ends.
    const descriptionOnly = !result.evidence.some((e) => e.kind !== 'description');
    const { status, ingredients, steps } = result.recipe;
    const hasIngredients = ingredients.some((i) => !i.is_group_header);
    const hasSteps = steps.some((s) => !s.is_group_header);
    const warnings = [...result.recipe.warnings];
    // Without captions only the description was read, so "no recipe" means we could not read the video.
    if (descriptionOnly && (status !== 'ok' || (!hasIngredients && !hasSteps))) {
      throw finalizeError('No captions, and the description has no recipe', 'unavailable', 'no_captions_no_description');
    }
    if (status === 'not_a_recipe') throw finalizeError('The model judged this is not a recipe video', 'not_a_recipe', 'model_not_a_recipe');
    if (status === 'insufficient') throw finalizeError('No ingredients and no steps were found', 'insufficient', 'empty_recipe');
    if (!hasIngredients || !hasSteps) {
      partial = exportRun(result, warnings, { partial: true });
      throw finalizeError(`Only ${hasIngredients ? 'ingredients' : 'steps'} were found`, 'insufficient', 'partial_recipe');
    }
    const run = exportRun(result, warnings);
    report({ stage: 'finalize', state: 'done', ms: Date.now() - startedAt });
    return {
      status: 'succeeded',
      canonical_key: key,
      extractor_version: extractorVersion(env),
      ...run,
      description_only: descriptionOnly,
      metrics: { stages, usage },
      warnings,
    };
  } catch (err) {
    if (isOpen()) report({ stage: current, state: 'failed', ms: Date.now() - startedAt });
    const known = err instanceof PipelineError;
    return {
      status: 'failed',
      canonical_key: key,
      extractor_version: extractorVersion(env),
      stage: known && err.stage ? err.stage : current,
      error_code: known ? err.errorCode : 'internal',
      reason: known ? err.reason : 'unexpected',
      retry: known ? err.retry : false,
      message: String(err?.message ?? err),
      partial,
      metrics: { stages, usage },
    };
  }
}
