// Timed transcript of an uploaded video (KAN-49). The upload has no YouTube captions or description,
// so speech is the only evidence until on-screen text (KAN-51) lands.
// KAN-50 decides how this compares with YouTube captions; here it only runs for uploads.
import { isTransientStatus, PipelineError } from './errors.mjs';

export const ASR_MODEL = 'whisper-1';
// OpenAI rejects audio files above 25 MB; the upload bucket has the same limit.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

const asrError = (message, errorCode, reason, retry = false, cause) =>
  new PipelineError(message, { stage: 'asr', errorCode, reason, retry, cause });

// Whisper verbose_json segments (seconds) -> raw caption segments ({ startMs, durMs, text }), the shape
// parseCaptionXml returns, so normalizeSegments treats both the same way.
export function toSegments(body) {
  return (body?.segments ?? [])
    .map((s) => {
      const startMs = Math.round(Number(s.start) * 1000);
      return { startMs, durMs: Math.max(0, Math.round(Number(s.end) * 1000) - startMs), text: String(s.text ?? '').trim() };
    })
    .filter((s) => s.text && Number.isFinite(s.startMs) && Number.isFinite(s.durMs));
}

// upload: { bytes: Uint8Array, filename, mime }
export async function transcribeUpload(upload, { env = process.env, fetchImpl = fetch, language } = {}) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw asrError('Set OPENAI_API_KEY to transcribe uploads.', 'internal', 'asr_config');
  if (upload.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw asrError(`Upload is ${upload.bytes.byteLength} bytes, over ${MAX_UPLOAD_BYTES}`, 'unavailable', 'upload_too_large');
  }

  const form = new FormData();
  form.append('file', new Blob([upload.bytes], { type: upload.mime || 'application/octet-stream' }), upload.filename || 'upload.mp4');
  form.append('model', ASR_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  if (language) form.append('language', language);

  let res;
  try {
    res = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw asrError(`Transcription request failed: ${err?.message ?? err}`, 'retryable', 'asr_transient', true, err);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    if (res.ok) throw asrError(`Transcription ${res.status}: response is not JSON`, 'retryable', 'asr_transient', true);
  }
  if (!res.ok) {
    const message = `Transcription ${res.status}: ${body?.error?.message ?? 'no body'}`;
    if (isTransientStatus(res.status)) throw asrError(message, 'retryable', 'asr_transient', true);
    if (res.status === 413) throw asrError(message, 'unavailable', 'upload_too_large');
    // 400 is a file the model cannot read (no audio track, broken file); the rest is our key or setup.
    if (res.status === 400) throw asrError(message, 'unavailable', 'upload_unreadable');
    throw asrError(message, 'internal', 'asr_config');
  }
  return { segments: toSegments(body), language: body?.language ?? null, durationMs: body?.duration != null ? Math.round(body.duration * 1000) : null };
}
