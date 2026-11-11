// On-screen text (KAN-51): frames sampled from the video with ffmpeg, read by a vision model, then merged
// into timed segments. Many Shorts and reels show the recipe only as text over the video, with music
// instead of speech, so without this their amounts have no evidence at all.
// OCR never fails the job: a missing tool, a video we cannot get or a failed request skips the stage
// with a reason, and the recipe is made from the other evidence (docs/dev-plan.md, stages 2-3).
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isTransientStatus, PipelineError } from './errors.mjs';

export const OCR_MODEL = 'gpt-4.1-mini';
// One frame a second catches text that stays up long enough to read. Long videos are sampled more
// sparsely so a run never sends more than MAX_FRAMES images.
export const FRAME_EVERY_MS = 1000;
export const MAX_FRAMES = 90;
const FRAME_WIDTH = 540;
const BATCH = 15;
const TIMEOUT_MS = 120_000;
const FFMPEG_TIMEOUT_MS = 60_000;

const ocrError = (message, reason, retry = false, cause) =>
  new PipelineError(message, { stage: 'ocr', errorCode: retry ? 'retryable' : 'internal', reason, retry, cause });

// Opt-in while it is measured (cost, time): the worker sets OCR=on.
export const ocrEnabled = (env) => env.OCR === 'on' && Boolean(env.OPENAI_API_KEY);

function run(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

const durationFrom = (stderr) => {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000) : null;
};

// [{ ms, jpeg }] from a video file in memory. The frame at index i shows the video at i * everyMs.
export async function sampleFrames(bytes, { durationMs = null, ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg' } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ocr-'));
  try {
    const input = join(dir, 'video.mp4');
    await writeFile(input, bytes);
    let duration = durationMs;
    if (duration == null) {
      // ffmpeg with no output prints the duration and exits non-zero; that is expected.
      const probe = await run(ffmpeg, ['-hide_banner', '-i', input], FFMPEG_TIMEOUT_MS).catch((err) => {
        throw ocrError(`ffmpeg could not start: ${err.message}`, 'ocr_tool_missing', false, err);
      });
      duration = durationFrom(probe.stderr);
    }
    const everyMs = Math.max(FRAME_EVERY_MS, duration ? Math.ceil(duration / MAX_FRAMES / 500) * 500 : FRAME_EVERY_MS);
    const out = await run(
      ffmpeg,
      ['-hide_banner', '-loglevel', 'error', '-i', input, '-vf', `fps=1000/${everyMs},scale=${FRAME_WIDTH}:-2`, '-frames:v', String(MAX_FRAMES), '-q:v', '4', join(dir, 'f%04d.jpg')],
      FFMPEG_TIMEOUT_MS,
    ).catch((err) => {
      throw ocrError(`ffmpeg could not start: ${err.message}`, 'ocr_tool_missing', false, err);
    });
    if (out.code !== 0) throw ocrError(`ffmpeg failed: ${out.stderr.trim().slice(0, 300)}`, 'ocr_unreadable');
    const files = (await readdir(dir)).filter((f) => /^f\d+\.jpg$/.test(f)).sort();
    const frames = [];
    for (const [i, f] of files.entries()) frames.push({ ms: i * everyMs, jpeg: await readFile(join(dir, f)) });
    if (!frames.length) throw ocrError('ffmpeg returned no frames', 'ocr_unreadable');
    return { frames, everyMs, durationMs: duration };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const PROMPT = `You read text shown on screen in frames of a cooking video. Frames are numbered in time order.
For each frame, copy the text that was put on the video: titles, captions and subtitles, ingredient lists, amounts, step text, labels.
- Copy it exactly as shown, including numbers, units and fractions. Do not translate, fix or complete it.
- Keep each line or caption block on its own line, top to bottom.
- Leave out watermarks, channel handles, app or platform buttons, and printed text on product packages.
- A frame with no such text gets an empty string. Never guess text that you cannot read.`;

const FRAMES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['frames'],
  properties: {
    frames: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['frame', 'text'],
        properties: { frame: { type: 'integer' }, text: { type: 'string' } },
      },
    },
  },
};

async function readBatch(batch, offset, { apiKey, model, fetchImpl }) {
  const content = [{ type: 'text', text: `Frames ${offset + 1} to ${offset + batch.length}.` }];
  for (const [i, f] of batch.entries()) {
    content.push({ type: 'text', text: `Frame ${offset + i + 1}:` });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from(f.jpeg).toString('base64')}`, detail: 'high' } });
  }
  let res;
  try {
    res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'screen_text', strict: true, schema: FRAMES_SCHEMA } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw ocrError(`OCR request failed: ${err?.message ?? err}`, 'ocr_transient', true, err);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    throw ocrError(`OCR ${res.status}: response is not JSON`, 'ocr_transient', true);
  }
  if (!res.ok) {
    const message = `OCR ${res.status}: ${body?.error?.message ?? 'no body'}`;
    throw isTransientStatus(res.status) ? ocrError(message, 'ocr_transient', true) : ocrError(message, 'ocr_config');
  }
  let data;
  try {
    data = JSON.parse(body.choices?.[0]?.message?.content);
  } catch {
    throw ocrError('OCR response is not the expected JSON', 'ocr_transient', true);
  }
  const texts = new Map(data.frames.map((f) => [f.frame, f.text]));
  return { texts: batch.map((_, i) => texts.get(offset + i + 1) ?? ''), usage: body.usage ?? null };
}

const squash = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// Text that stays on screen across frames is one segment, from the first frame showing it to the frame
// after the last. Each line of a frame is followed on its own, so a list that grows line by line keeps
// its earlier lines as single segments instead of repeating them.
export function mergeFrameTexts(texts, everyMs) {
  const open = new Map();
  const done = [];
  texts.forEach((text, i) => {
    const lines = [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => squash(l)))];
    const keys = new Set(lines.map(squash));
    for (const [key, seg] of open) {
      if (!keys.has(key)) {
        done.push(seg);
        open.delete(key);
      }
    }
    for (const line of lines) {
      const key = squash(line);
      const seg = open.get(key);
      if (seg) seg.endMs = (i + 1) * everyMs;
      else open.set(key, { startMs: i * everyMs, endMs: (i + 1) * everyMs, text: line });
    }
  });
  done.push(...open.values());
  return done.sort((a, b) => a.startMs - b.startMs || 0);
}

const pad = (n, total) => String(n).padStart(Math.max(2, String(total).length), '0');

export const ocrSegments = (merged) => merged.map((s, i) => ({ id: `O${pad(i + 1, merged.length)}`, kind: 'ocr', ...s }));

// { segments, model, frames, everyMs, usage } for a video file in memory.
export async function readScreenText(video, { env = process.env, fetchImpl = fetch, sample = sampleFrames, durationMs = null } = {}) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw ocrError('Set OPENAI_API_KEY to read on-screen text.', 'ocr_config');
  const model = env.OCR_MODEL || OCR_MODEL;
  const { frames, everyMs } = await sample(video.bytes, { durationMs });
  const texts = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  for (let i = 0; i < frames.length; i += BATCH) {
    const out = await readBatch(frames.slice(i, i + BATCH), i, { apiKey, model, fetchImpl });
    texts.push(...out.texts);
    for (const k of Object.keys(usage)) usage[k] += out.usage?.[k] ?? 0;
  }
  return { segments: ocrSegments(mergeFrameTexts(texts, everyMs)), model, frames: frames.length, everyMs, usage };
}
