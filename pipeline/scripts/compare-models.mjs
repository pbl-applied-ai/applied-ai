// node scripts/compare-models.mjs <transcript.json> <model> [model...]
// Runs every model on the same transcript and writes compare/<prompt_version>/<video_id>/<model>.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { runPipeline } from '../src/pipeline.mjs';
import { printRecipe } from '../src/print.mjs';
import { PROMPT_VERSION } from '../src/schema.mjs';

const [transcriptFile, ...models] = process.argv.slice(2);
if (!transcriptFile || !models.length) {
  console.error('usage: node scripts/compare-models.mjs <transcript.json> <model> [model...]');
  process.exit(1);
}

const videoId = JSON.parse(await readFile(transcriptFile, 'utf8')).video?.videoId ?? 'unknown';
const outDir = new URL(`../compare/${PROMPT_VERSION}/${videoId}/`, import.meta.url);
await mkdir(outDir, { recursive: true });

for (const model of models) {
  console.log(`\n==================== ${model}`);
  try {
    const result = await runPipeline({ transcriptFile, env: { ...process.env, LLM_PROVIDER: 'openai', LLM_MODEL: model } });
    await writeFile(new URL(`${model}.json`, outDir), JSON.stringify(result, null, 2));
    const u = result.meta.usage || {};
    printRecipe(result);
    console.log(`tokens: in ${u.prompt_tokens} / out ${u.completion_tokens}`);
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
  }
}
