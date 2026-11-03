export function formatClock(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const pad = (n, total) => String(n).padStart(Math.max(2, String(total).length), '0');

// Short caption lines are merged so the LLM sees sentence-sized evidence units,
// but a merged segment never spans more than maxSpanMs so step times stay precise.
export function normalizeSegments(raw, { minChars = 0, maxSpanMs = 8000 } = {}) {
  const sorted = [...raw].sort((a, b) => a.startMs - b.startMs);
  const merged = [];
  for (const seg of sorted) {
    const last = merged[merged.length - 1];
    const canMerge =
      last && last.text.length < minChars && seg.startMs - last.startMs + seg.durMs <= maxSpanMs;
    if (canMerge) {
      last.text = `${last.text} ${seg.text}`;
      last.endMs = Math.max(last.endMs, seg.startMs + seg.durMs);
    } else {
      merged.push({ startMs: seg.startMs, endMs: seg.startMs + seg.durMs, text: seg.text });
    }
  }
  return merged.map((s, i) => ({ id: `S${pad(i + 1, merged.length)}`, kind: 'speech', ...s }));
}

// Recipes in descriptions and pinned comments are usually one ingredient per line, so each line
// is its own evidence unit. Links and hashtag-only lines carry no recipe content.
function lineSegments(text, prefix, kind, maxLines) {
  const lines = (text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^https?:\/\/\S+$/.test(l) && !/^(#\S+\s*)+$/.test(l))
    .slice(0, maxLines);
  return lines.map((t, i) => ({ id: `${prefix}${pad(i + 1, lines.length)}`, kind, startMs: null, endMs: null, text: t }));
}

export const descriptionSegments = (description, { maxLines = 80 } = {}) => lineSegments(description, 'D', 'description', maxLines);

// The creator's pinned comment, which some Shorts use instead of the description for the recipe.
export const commentSegments = (comment, { maxLines = 80 } = {}) => lineSegments(comment, 'C', 'comment', maxLines);

const UNTIMED_LABEL = { description: '설명', comment: '고정 댓글' };

export function renderForPrompt(segments) {
  return segments
    .map((s) => (UNTIMED_LABEL[s.kind] ? `[${s.id} ${UNTIMED_LABEL[s.kind]}] ${s.text}` : `[${s.id} ${formatClock(s.startMs)}] ${s.text}`))
    .join('\n');
}
