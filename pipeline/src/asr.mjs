// Timed transcript of an uploaded video (KAN-49). The upload has no YouTube captions or description,
// so speech is the only evidence until on-screen text (KAN-51) lands.
// KAN-50 decides how this compares with YouTube captions; here it only runs for uploads.
import { isTransientStatus, PipelineError } from './errors.mjs';

export const ASR_MODEL = 'whisper-1';
// OpenAI rejects audio files above 25 MB; the upload bucket has the same limit.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 120_000;
// Whisper's own silence rule: a segment counts as silent when both are past these values.
const NO_SPEECH_PROB = 0.6;
const MIN_AVG_LOGPROB = -1;
// Music alone can come back as a few words in an unrelated language (KAN-50). A language we do not
// expect is only believed when there is about as much text as real speech has (Korean runs near 5 per second).
// Whisper also names real Korean speech Javanese or Nynorsk, so text that is mostly Hangul counts as Korean.
// Thresholds come from the 12 development reels (11/9), never from the eval set.
const EXPECTED_LANGUAGES = new Set(['korean', 'english', 'ko', 'en']);
const MIN_CHARS_PER_SECOND = 2;
// Near-silent clips also come back as a few low-confidence syllables ("으", "차"). Real speech in the
// development reels averaged above -1; garbled real speech with the wrong language reached -3.7.
const GIBBERISH_LOGPROB = -3;

// Lines Whisper writes over music or silence, learned from video outros. A segment that is only this is dropped.
const FILLER = [
  '시청해주셔서감사합니다', '시청해주셔서고맙습니다', '시청해주셔서감사드립니다', '구독과좋아요', '구독좋아요',
  '좋아요와구독', '구독과좋아요부탁드립니다', '구독좋아요알림설정', '구독좋아요알림설정부탁드립니다', '자막제공',
  '다음영상에서만나요', '맛있게잘먹겠습니다',
  'thanksforwatching', 'thankyouforwatching', 'pleasesubscribe', 'seeyounexttime', 'ifyoulikemyvideopleasesubscribe',
];
const squash = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const isFiller = (text) => {
  const t = squash(text);
  return t.length > 0 && FILLER.some((f) => t === f || (t.includes(f) && f.length / t.length >= 0.6));
};

// 'ko' when Hangul is a real share of the letters (a Korean caption or transcript), else null.
export function hangulLanguage(text) {
  const hangul = (text.match(/[\uac00-\ud7a3]/g) ?? []).length;
  const latin = (text.match(/[a-z]/gi) ?? []).length;
  return hangul >= 5 && hangul >= (hangul + latin) * 0.3 ? 'ko' : null;
}

const asrError = (message, errorCode, reason, retry = false, cause) =>
  new PipelineError(message, { stage: 'asr', errorCode, reason, retry, cause });

// Whisper verbose_json segments (seconds) -> raw caption segments ({ startMs, durMs, text }), the shape
// parseCaptionXml returns, so normalizeSegments treats both the same way.
export function toSegments(body) {
  return (body?.segments ?? [])
    .filter((s) => !(s.no_speech_prob > NO_SPEECH_PROB && s.avg_logprob < MIN_AVG_LOGPROB))
    .map((s) => {
      const startMs = Math.round(Number(s.start) * 1000);
      return { startMs, durMs: Math.max(0, Math.round(Number(s.end) * 1000) - startMs), text: String(s.text ?? '').trim() };
    })
    .filter((s) => s.text && !isFiller(s.text) && Number.isFinite(s.startMs) && Number.isFinite(s.durMs));
}

// True when the transcript is not speech: nothing left, too little text in an unexpected language,
// or a sparse run of syllables Whisper itself was very unsure of. meanLogprob is the average avg_logprob.
export function looksLikeNoSpeech(segments, language, durationMs, { meanLogprob = null } = {}) {
  if (!segments.length) return true;
  if (!durationMs) return false;
  const text = segments.map((s) => s.text).join(' ');
  const sparse = text.replace(/\s/g, '').length / (durationMs / 1000) < MIN_CHARS_PER_SECOND;
  if (sparse && meanLogprob != null && meanLogprob < GIBBERISH_LOGPROB) return true;
  if (!language || EXPECTED_LANGUAGES.has(language.toLowerCase()) || hangulLanguage(text)) return false;
  return sparse;
}

// Whisper verbose_json -> what the collectors use. No speech comes back as no segments.
export function readTranscript(body) {
  const segments = toSegments(body);
  const language = body?.language ?? null;
  const durationMs = body?.duration != null ? Math.round(body.duration * 1000) : null;
  const probs = (body?.segments ?? []).map((s) => Number(s.avg_logprob)).filter(Number.isFinite);
  const meanLogprob = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : null;
  return { segments: looksLikeNoSpeech(segments, language, durationMs, { meanLogprob }) ? [] : segments, language, durationMs };
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
  return readTranscript(body);
}
