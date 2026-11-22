// 링크 형식 검사. YouTube Shorts와 Instagram 릴스 링크를 받는다(docs/ux-flow.md S2 "Instagram 연결 뒤", KAN-62).
// 일반 watch 링크·youtu.be 링크는 파이프라인이 처리할 수 있어도 화면에서 막는다.
// Instagram 게시물(/p/) 링크는 주소만으로 릴스인지 사진인지 알 수 없어 막지 않는다. 사진이면 워커가 ig_not_video로 끝낸다.

export type VideoPlatform = "youtube" | "instagram";

export type ShortsCheck =
  | { ok: true; platform: VideoPlatform; videoId: string; url: string }
  | { ok: false; reason: "empty" | "not_shorts" | "unsupported" };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
// pipeline/src/instagram.mjs CODE_RE와 같다: /reel/<code>, /reels/<code>, /p/<code>, /tv/<code>, 앞에 계정 이름이 붙어도 된다
const REEL_PATH = /^\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]{5,})/;

export function checkShortsUrl(input: string): ShortsCheck {
  const raw = input.trim();
  if (raw === "") return { ok: false, reason: "empty" };

  // 주소로 읽을 수 없는 글(형식 오류)은 not_shorts, 다른 서비스 주소는 unsupported (docs/ux-flow.md S2)
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: "not_shorts" };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".")) return { ok: false, reason: "not_shorts" };

  if (INSTAGRAM_HOSTS.has(host)) {
    // 공유 링크에 붙는 추적용 값(?igsh=…)은 버리고, 같은 릴스는 같은 주소가 되게 /reel/<code>/로 맞춘다
    const code = parsed.pathname.match(REEL_PATH)?.[1];
    return code
      ? { ok: true, platform: "instagram", videoId: code, url: `https://www.instagram.com/reel/${code}/` }
      : { ok: false, reason: "not_shorts" };
  }

  if (!YOUTUBE_HOSTS.has(host)) return { ok: false, reason: "unsupported" };

  const [first, id] = parsed.pathname.split("/").filter(Boolean);
  if (host.endsWith("youtube.com") && first === "shorts" && id && VIDEO_ID.test(id)) {
    return { ok: true, platform: "youtube", videoId: id, url: `https://www.youtube.com/shorts/${id}` };
  }
  return { ok: false, reason: "not_shorts" };
}

/** 원본 링크로 고른 플랫폼 이름. 레시피 상세의 원본 카드에 쓴다 */
export function sourcePlatformLabel(sourceUrl: string): string {
  try {
    return INSTAGRAM_HOSTS.has(new URL(sourceUrl).hostname.toLowerCase()) ? "Instagram Reels" : "YouTube Shorts";
  } catch {
    return "YouTube Shorts";
  }
}

export const SHORTS_ERROR_TEXT: Record<"not_shorts" | "unsupported", string> = {
  not_shorts: "That's not a YouTube Shorts or Instagram Reels link. Please check the URL.",
  unsupported: "For now, we only support YouTube Shorts and Instagram Reels.",
};
