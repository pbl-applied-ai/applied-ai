const NEXT_URL = 'https://www.youtube.com/youtubei/v1/next?prettyPrint=false';
const WEB_CLIENT = { clientName: 'WEB', clientVersion: '2.20251020.01.00', hl: 'ko', gl: 'KR' };
const TIMEOUT_MS = 15_000;

async function next(fetchImpl, body, timeoutMs) {
  const res = await fetchImpl(NEXT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, context: { client: WEB_CLIENT } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`next HTTP ${res.status}`);
  return res.json();
}

// The watch page response carries a continuation token per comment section; the one for the
// main comments has "comments-section" inside its base64 payload.
export function commentsToken(page) {
  let token = null;
  JSON.stringify(page, (key, value) => {
    if (!token && key === 'continuationCommand' && typeof value?.token === 'string') {
      const decoded = Buffer.from(decodeURIComponent(value.token), 'base64').toString('latin1');
      if (decoded.includes('comments-section')) token = value.token;
    }
    return value;
  });
  return token;
}

// Comment text lives in entity payloads; the pinned badge lives on the thread renderer. They share
// the comment ID. Only a comment the creator wrote and pinned counts: a pinned viewer comment is
// often a question or a joke, not the recipe.
export function pinnedCreatorComment(page) {
  const pinnedIds = new Set();
  JSON.stringify(page, (key, value) => {
    if (key === 'commentViewModel' && value?.pinnedText && value.commentId) pinnedIds.add(value.commentId);
    return value;
  });
  const entities = (page.frameworkUpdates?.entityBatchUpdate?.mutations ?? [])
    .map((m) => m.payload?.commentEntityPayload)
    .filter(Boolean);
  const pinned = entities.find((e) => pinnedIds.has(e.properties?.commentId) && e.author?.isCreator);
  const text = pinned?.properties?.content?.content?.trim();
  return text ? { text, author: pinned.author.displayName ?? null } : null;
}

// Returns the creator's pinned comment, or null when there is none or it cannot be read.
// Comments are an extra source: a failure here is reported, never fatal to the recipe.
export async function fetchPinnedComment(videoId, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  try {
    const token = commentsToken(await next(fetchImpl, { videoId }, timeoutMs));
    if (!token) return { comment: null, note: 'no comments section (comments may be turned off)' };
    const comment = pinnedCreatorComment(await next(fetchImpl, { continuation: token }, timeoutMs));
    return { comment, note: comment ? null : 'no pinned comment by the creator' };
  } catch (err) {
    const reason = err?.name === 'TimeoutError' ? `timed out after ${timeoutMs / 1000}s` : err?.message ?? String(err);
    return { comment: null, note: `pinned comment not fetched: ${reason}` };
  }
}
