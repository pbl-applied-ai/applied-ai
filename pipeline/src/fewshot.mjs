import { readFile, writeFile } from 'node:fs/promises';
import { PipelineError } from './errors.mjs';

// Few-shot examples: worked gold examples (a user prompt and its answer) shown to the model before the real video.
// For each video the examples whose evidence reads most like it are picked by embedding similarity.
// The example index holds other people's captions, so it is kept outside the public repo (FEWSHOT_INDEX).

export const EMBED_MODEL = 'text-embedding-3-small';
// The embedding input limit is 8,192 tokens; the start of the evidence (title, channel, first lines) is enough.
const EMBED_CHARS = 6000;
const DEFAULT_K = 2;

const embedError = (message) => new PipelineError(message, { stage: 'structure', errorCode: 'retryable', reason: 'embed_failed', retry: true });

export async function embed(texts, { apiKey, fetchImpl = fetch }) {
  const res = await fetchImpl('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts.map((t) => t.slice(0, EMBED_CHARS)) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw embedError(`OpenAI embeddings ${res.status}: ${body.error?.message ?? 'no detail'}`);
  return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

const cosine = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na * nb) || 1);
};

// index.examples: [{ id, user, assistant, embedding }]. Returns the k closest, most similar first.
export function pickExamples(index, queryEmbedding, k = DEFAULT_K) {
  return index.examples
    .map((ex) => ({ ex, score: cosine(ex.embedding, queryEmbedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ ex, score }) => ({ id: ex.id, user: ex.user, assistant: ex.assistant, score }));
}

// Training JSONL (system, user, assistant per line) -> index file with one embedding per example.
export async function buildIndex(jsonlText, { apiKey, fetchImpl = fetch, ids = [] }) {
  const rows = jsonlText.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l).messages);
  const examples = rows.map((m, i) => ({
    id: ids[i] ?? `ex-${i + 1}`,
    user: m.find((x) => x.role === 'user').content,
    assistant: m.find((x) => x.role === 'assistant').content,
  }));
  const embeddings = [];
  for (let i = 0; i < examples.length; i += 50) embeddings.push(...(await embed(examples.slice(i, i + 50).map((e) => e.user), { apiKey, fetchImpl })));
  examples.forEach((e, i) => { e.embedding = embeddings[i]; });
  return { model: EMBED_MODEL, built_at: new Date().toISOString(), examples };
}

const cache = new Map();
async function loadIndex(file) {
  if (!cache.has(file)) cache.set(file, JSON.parse(await readFile(file, 'utf8')));
  return cache.get(file);
}

// FEWSHOT_INDEX turns few-shot on; FEWSHOT_K (default 2) sets how many examples. Needs OPENAI_API_KEY for the query
// embedding. Returns [] when few-shot is off.
export async function examplesFor(userPrompt, { env = process.env, fetchImpl = fetch } = {}) {
  if (!env.FEWSHOT_INDEX) return [];
  const k = Number(env.FEWSHOT_K ?? DEFAULT_K);
  if (!k) return [];
  if (!env.OPENAI_API_KEY) throw new PipelineError('FEWSHOT_INDEX needs OPENAI_API_KEY for embeddings.', { stage: 'structure', errorCode: 'internal', reason: 'llm_config' });
  const index = await loadIndex(env.FEWSHOT_INDEX);
  const [q] = await embed([userPrompt], { apiKey: env.OPENAI_API_KEY, fetchImpl });
  return pickExamples(index, q, k);
}

export async function writeIndex(file, index) {
  await writeFile(file, JSON.stringify(index));
}
