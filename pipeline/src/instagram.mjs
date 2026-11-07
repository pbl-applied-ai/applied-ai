// Instagram reels through an outside collection API (docs/dev-plan.md, KAN-53): Apify first for the caption
// and audio, ScrapeCreators when Apify fails or finds nothing, because only its 404 says the reel is gone.
// Media links expire within about a day and a half, so they are read now and kept only in memory.
import { MAX_UPLOAD_BYTES } from './asr.mjs';
import { isTransientStatus, PipelineError } from './errors.mjs';

const APIFY_URL = 'https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items';
const SCRAPECREATORS_URL = 'https://api.scrapecreators.com/v1/instagram/post';
const VENDOR_TIMEOUT_MS = 120_000;
const MEDIA_TIMEOUT_MS = 60_000;

const CODE_RE = /^\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]{5,})/;

const collectError = (message, errorCode, reason, retry = false) =>
  new PipelineError(message, { stage: 'collect', errorCode, reason, retry });
const notFound = (code) => collectError(`Reel ${code} was not found`, 'unavailable', 'ig_not_found');

export function parseReelCode(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.hostname.replace(/^(www|m)\./, '') !== 'instagram.com') return null;
  return url.pathname.match(CODE_RE)?.[1] ?? null;
}

export const reelUrl = (code) => `https://www.instagram.com/reel/${code}/`;

// Without a key the worker treats Instagram as it did before the collector existed.
export const instagramEnabled = (env) => Boolean(env.APIFY_TOKEN || env.SCRAPECREATORS_API_KEY);

// The rest of the status codes, the same for both vendors. ScrapeCreators checks its 404 and 403 first.
function vendorError(label, res, body) {
  const detail = body?.error?.message ?? body?.message ?? body?.error ?? 'no body';
  const message = `${label} ${res.status}: ${detail}`;
  if (isTransientStatus(res.status) || res.status === 408) return collectError(message, 'retryable', 'vendor_transient', true);
  if (res.status === 402) return collectError(message, 'internal', 'vendor_quota');
  return collectError(message, 'internal', 'vendor_config');
}

async function callVendor(label, url, init, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(VENDOR_TIMEOUT_MS) });
  } catch (err) {
    throw collectError(`${label} request failed: ${err?.message ?? err}`, 'retryable', 'vendor_transient', true);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    if (res.ok) throw collectError(`${label} ${res.status}: response is not JSON`, 'retryable', 'vendor_transient', true);
  }
  return { res, body };
}

// null when the run worked but returned nothing for this reel: Apify gives no reason for that.
async function askApify(code, { env, fetchImpl }) {
  const { res, body } = await callVendor('Apify', APIFY_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.APIFY_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ directUrls: [reelUrl(code)], resultsType: 'posts', resultsLimit: 1, addParentData: false }),
  }, fetchImpl);
  if (!res.ok) throw vendorError('Apify', res, body);
  const item = (Array.isArray(body) ? body : []).find((i) => !i.error);
  if (!item) return null;
  return {
    vendor: 'apify',
    isVideo: item.type === 'Video' || Boolean(item.videoUrl),
    caption: item.caption ?? '',
    author: item.ownerUsername ?? null,
    durationMs: item.videoDuration != null ? Math.round(item.videoDuration * 1000) : null,
    audioUrl: item.audioUrl ?? null,
    videoUrl: item.videoUrl ?? null,
  };
}

async function askScrapeCreators(code, { env, fetchImpl }) {
  const url = `${SCRAPECREATORS_URL}?url=${encodeURIComponent(reelUrl(code))}`;
  const { res, body } = await callVendor('ScrapeCreators', url, { headers: { 'x-api-key': env.SCRAPECREATORS_API_KEY } }, fetchImpl);
  if (res.status === 404) throw notFound(code);
  if (res.status === 403) throw collectError(`Reel ${code} is restricted`, 'unavailable', 'ig_blocked');
  if (!res.ok) throw vendorError('ScrapeCreators', res, body);
  const media = body?.data?.xdt_shortcode_media;
  if (!media) throw notFound(code);
  return {
    vendor: 'scrapecreators',
    isVideo: media.is_video !== false && Boolean(media.video_url),
    caption: media.edge_media_to_caption?.edges?.[0]?.node?.text ?? '',
    author: media.owner?.username ?? null,
    durationMs: media.video_duration != null ? Math.round(media.video_duration * 1000) : null,
    audioUrl: null,
    videoUrl: media.video_url ?? null,
  };
}

export async function fetchReel(code, { env = process.env, fetchImpl = fetch } = {}) {
  let apifyFailure = null;
  let reel = null;
  if (env.APIFY_TOKEN) {
    try {
      reel = await askApify(code, { env, fetchImpl });
    } catch (err) {
      if (!(err instanceof PipelineError)) throw err;
      apifyFailure = err;
    }
  }
  if (!reel) {
    if (!env.SCRAPECREATORS_API_KEY) throw apifyFailure ?? notFound(code);
    reel = await askScrapeCreators(code, { env, fetchImpl });
  }
  if (!reel.isVideo) throw collectError(`Post ${code} is not a video`, 'unsupported_source', 'ig_not_video');
  return reel;
}

// { bytes } of a media link. Without bytes, transient says whether trying again later could work:
// a 5xx, 429 or dropped connection could, a dead link or a file over the speech recognition limit would not.
async function download(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS) });
    if (!res.ok) return { transient: isTransientStatus(res.status) || res.status === 408 };
    if (Number(res.headers?.get?.('content-length')) > MAX_UPLOAD_BYTES) return { transient: false };
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.byteLength && bytes.byteLength <= MAX_UPLOAD_BYTES ? { bytes } : { transient: false };
  } catch {
    return { transient: true };
  }
}

// { media, transient }: the file to send to speech recognition, or null and whether that could change later.
// The audio file is far smaller, so the video is the fallback.
export async function reelMedia(reel, { fetchImpl = fetch } = {}) {
  const sources = [
    { url: reel.audioUrl, filename: 'audio.mp4', mime: 'audio/mp4' },
    { url: reel.videoUrl, filename: 'video.mp4', mime: 'video/mp4' },
  ];
  let transient = false;
  for (const { url, filename, mime } of sources) {
    if (!url) continue;
    const out = await download(url, fetchImpl);
    if (out.bytes) return { media: { bytes: out.bytes, filename, mime }, transient: false };
    transient ||= out.transient;
  }
  return { media: null, transient };
}
