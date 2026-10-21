// node scripts/repeat-model.mjs <transcript.json> <model> <runs>
// Runs one model several times on the same transcript to separate run-to-run variance from prompt effects.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { runPipeline } from '../src/pipeline.mjs';
import { PROMPT_VERSION } from '../src/schema.mjs';

const [transcriptFile, model, runsArg = '3'] = process.argv.slice(2);
if (!transcriptFile || !model) {
  console.error('usage: node scripts/repeat-model.mjs <transcript.json> <model> [runs]');
  process.exit(1);
}

const videoId = JSON.parse(await readFile(transcriptFile, 'utf8')).video?.videoId ?? 'unknown';
const outDir = new URL(`../compare/${PROMPT_VERSION}/${videoId}/repeat/`, import.meta.url);
await mkdir(outDir, { recursive: true });

for (let run = 1; run <= Number(runsArg); run++) {
  const result = await runPipeline({ transcriptFile, env: { ...process.env, LLM_PROVIDER: 'openai', LLM_MODEL: model } });
  await writeFile(new URL(`${model}.run${run}.json`, outDir), JSON.stringify(result, null, 2));
  const r = result.recipe;
  const amounts = r.ingredients
    .filter((i) => i.amounts.length)
    .map((i) => `${i.name}=${i.amounts.map((a) => a.text).join('/')}`)
    .join(', ');
  console.log(
    `run ${run}: 재료 ${r.summary.ingredients} · 분량 ${r.summary.amounts_confirmed} · 단계 ${r.summary.steps} · 경고 ${r.warnings.length} · ${(result.meta.latency_ms / 1000).toFixed(1)}s | ${amounts || '(분량 없음)'}`,
  );
}
