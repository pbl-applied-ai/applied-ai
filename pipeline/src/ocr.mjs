// On-screen text (KAN-51): frames every few seconds with ffmpeg, read by a vision model, and the same text on
// consecutive frames merged into one timed segment. Only for videos we have as a file (uploads, Instagram);
// YouTube video files are not downloaded. Without ffmpeg the stage is skipped and nothing else changes.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const OCR_VERSION = 'ocr-frames-v1';
const FRAME_EVERY_MS = 2000;
const MAX_FRAMES = 90; // 3 minutes, the longest Shorts
const FRAMES_PER_CALL = 10;
const TIMEOUT_MS = 120_000;

let found;
// The ffmpeg to use (FFMPEG_PATH or the one on PATH), or null. Checked once per process.
export function findFfmpeg(env = process.env) {
  if (found !== undefined && !env.FFMPEG_PATH) return found;
  const bin = env.FFMPEG_PATH?.trim() || 'ffmpeg';
  const ok = spawnSync(bin, ['-version'], { stdio: 'ignore', windowsHide: true }).status === 0;
  if (!env.FFMPEG_PATH) found = ok ? bin : null;
  return ok ? bin : null;
}

// Off unless OCR=on (each video costs a few vision calls), and only with ffmpeg and an OpenAI key.
export const ocrEnabled = (env = process.env) =>
  env.OCR?.trim().toLowerCase() === 'on' && Boolean(env.OPENAI_API_KEY) && Boolean(findFfmpeg(env));

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => {
      err += d;
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-300)}`))));
  });
}

// JPEG frames of a video file with their times. The temporary folder is always removed.
export async function extractFrames(bytes, { env = process.env, everyMs = FRAME_EVERY_MS, maxFrames = MAX_FRAMES } = {}) {
  const bin = findFfmpeg(env);
  if (!bin) throw new Error('ffmpeg not found');
  const dir = await mkdtemp(join(tmpdir(), 'recipe-ocr-'));
  try {
    await writeFile(join(dir, 'in'), bytes);
    await run(bin, [
      '-loglevel', 'error', '-i', join(dir, 'in'),
      '-vf', `fps=1000/${everyMs},scale='min(720,iw)':-2`,
      '-frames:v', String(maxFrames), '-q:v', '5', join(dir, 'f%03d.jpg'),
    ]);
    const names = (await readdir(dir)).filter((n) => n.endsWith('.jpg')).sort();
    return Promise.all(names.map(async (name, i) => ({ atMs: i * everyMs, jpeg: await readFile(join(dir, name)) })));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const READ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['frames'],
  properties: {
    frames: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'text'],
        properties: { number: { type: 'integer' }, text: { type: 'string' } },
      },
    },
  },
};

const READ_PROMPT = `These are numbered frames from a cooking video, in order. For each frame, copy the text shown on screen that is about the recipe: dish name, ingredients, amounts, steps, tips. Copy it exactly as shown, including numbers and units, in reading order, one space between lines.
Leave text empty when the frame shows no such text. Ignore logos, watermarks, channel names, subscribe buttons and text that is only decoration.`;

async function readBatch(frames, offset, { apiKey, model, fetchImpl }) {
  const content = [{ type: 'text', text: READ_PROMPT }];
  frames.forEach((f, i) => {
    content.push({ type: 'text', text: `Frame ${offset + i + 1}` });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${f.jpeg.toString('base64')}`, detail: 'low' } });
  });
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_schema', json_schema: { name: 'screen_text', strict: true, schema: READ_SCHEMA } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`OCR ${res.status}: ${body?.error?.message ?? 'no body'}`);
  return { data: JSON.parse(body.choices?.[0]?.message?.content ?? '{"frames":[]}'), usage: body.usage ?? null };
}

const sameText = (a, b) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');

// Frames → timed segments ({ startMs, durMs, text }), one per run of the same text.
export function mergeFrames(texts, everyMs = FRAME_EVERY_MS) {
  const out = [];
  texts.forEach((text, i) => {
    const t = (text ?? '').trim();
    const last = out.at(-1);
    if (t && last && last.lastIndex === i - 1 && sameText(last.text, t)) {
      last.durMs += everyMs;
      last.lastIndex = i;
    } else if (t) {
      out.push({ startMs: i * everyMs, durMs: everyMs, text: t, lastIndex: i });
    }
  });
  return out.map(({ lastIndex, ...s }) => s);
}

// The video's on-screen text as raw timed segments, with what it cost. frames skips ffmpeg (tests).
export async function readScreenText(bytes, { env = process.env, fetchImpl = fetch, model = env.OCR_MODEL || 'gpt-4.1', frames: given } = {}) {
  const frames = given ?? (await extractFrames(bytes, { env }));
  const texts = new Array(frames.length).fill('');
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  for (let i = 0; i < frames.length; i += FRAMES_PER_CALL) {
    const out = await readBatch(frames.slice(i, i + FRAMES_PER_CALL), i, { apiKey: env.OPENAI_API_KEY, model, fetchImpl });
    for (const f of out.data.frames ?? []) {
      const n = Number(f.number) - 1;
      if (n >= i && n < i + FRAMES_PER_CALL && n < frames.length) texts[n] = String(f.text ?? '');
    }
    usage.prompt_tokens += out.usage?.prompt_tokens ?? 0;
    usage.completion_tokens += out.usage?.completion_tokens ?? 0;
  }
  return { segments: mergeFrames(texts), frames: frames.length, model, usage };
}
