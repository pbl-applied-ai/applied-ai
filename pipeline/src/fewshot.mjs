import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
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
    .map(({ ex, score }) => ({ id: ex.id, user: englishLabels(ex.user), assistant: ex.assistant, score }));
}

// Indexes built before prompt v10 hold the old Korean evidence labels; examples should look like the real prompt.
export const englishLabels = (text) =>
  text.replace(/\[(\w+) 설명\]/g, '[$1 description]').replace(/\[(\w+) 고정 댓글\]/g, '[$1 pinned]').replace(/\[(\w+ \d\d:\d\d) 화면\]/g, '[$1 on screen]');

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

const fewshotK = (env) => {
  const k = Number(env.FEWSHOT_K ?? DEFAULT_K);
  return Number.isInteger(k) && k > 0 ? k : 0;
};

// FEWSHOT_INDEX turns few-shot on; FEWSHOT_K (default 2, 0 = off) sets how many examples. The query embedding needs
// OPENAI_API_KEY, so without it few-shot stays off (like OCR).
export const fewshotEnabled = (env = process.env) => Boolean(env.FEWSHOT_INDEX?.trim()) && fewshotK(env) > 0 && Boolean(env.OPENAI_API_KEY);

// The cache key part for few-shot runs (job.mjs extractorVersion): a hash of the index file and k, so results made
// with another index, another k or no examples at all are never reused for each other. The hash is kept per file
// until its size or modified time changes. An unreadable file gives 'unreadable'; examplesFor then fails and the run
// is marked lost, so nothing made under that key is reused.
const hashes = new Map();
export function fewshotVersion(env = process.env) {
  const file = env.FEWSHOT_INDEX.trim();
  let index = 'unreadable';
  try {
    const { size, mtimeMs } = statSync(file);
    const stamp = `${size}:${mtimeMs}`;
    if (hashes.get(file)?.stamp !== stamp) {
      hashes.set(file, { stamp, hash: createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12) });
    }
    index = hashes.get(file).hash;
  } catch {
    // Left as 'unreadable'.
  }
  return { index, k: fewshotK(env) };
}

// Returns [] when few-shot is off. Throws when the index cannot be read or the embedding call fails; the pipeline
// then carries on without examples (src/pipeline.mjs).
export async function examplesFor(userPrompt, { env = process.env, fetchImpl = fetch } = {}) {
  if (!fewshotEnabled(env)) return [];
  const k = fewshotK(env);
  const index = await loadIndex(env.FEWSHOT_INDEX.trim());
  const [q] = await embed([userPrompt], { apiKey: env.OPENAI_API_KEY, fetchImpl });
  return pickExamples(index, q, k);
}

export async function writeIndex(file, index) {
  await writeFile(file, JSON.stringify(index));
}
