// YouTube Shorts 링크 형식 검사. MVP는 Shorts 링크만 받는다(docs/ux-flow.md S2).
// 일반 watch 링크·youtu.be 링크는 파이프라인이 처리할 수 있어도 화면에서 막는다.

export type ShortsCheck =
  | { ok: true; videoId: string; url: string }
  | { ok: false; reason: "empty" | "not_shorts" | "unsupported" };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);

export function checkShortsUrl(input: string): ShortsCheck {
  const raw = input.trim();
  if (raw === "") return { ok: false, reason: "empty" };

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: "unsupported" };
  }

  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return { ok: false, reason: "unsupported" };

  const [first, id] = parsed.pathname.split("/").filter(Boolean);
  if (host.endsWith("youtube.com") && first === "shorts" && id && VIDEO_ID.test(id)) {
    return { ok: true, videoId: id, url: `https://www.youtube.com/shorts/${id}` };
  }
  return { ok: false, reason: "not_shorts" };
}

export const SHORTS_ERROR_TEXT: Record<"not_shorts" | "unsupported", string> = {
  not_shorts: "YouTube Shorts 링크가 아니에요. 주소를 다시 확인해 주세요.",
  unsupported: "아직 YouTube Shorts만 지원해요.",
};
