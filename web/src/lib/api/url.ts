// 링크 입력 화면(S2)의 형식 검사. 버튼을 누르기 전에 입력칸 아래에 알려 준다.
// 최종 판단은 워커가 한다(unsupported_source). 여기서는 흔한 실수만 걸러낸다.

const PATTERNS = [
  /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})(?:[/?#].*)?$/,
  /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$/,
  /^(?:https?:\/\/)?youtu\.be\/([A-Za-z0-9_-]{11})(?:[/?#].*)?$/,
];

export type UrlCheck =
  | { ok: true; url: string; videoId: string }
  | { ok: false; reason: 'empty' | 'not_youtube' | 'invalid' };

export function checkSourceUrl(input: string): UrlCheck {
  const text = input.trim();
  if (!text) return { ok: false, reason: 'empty' };
  for (const pattern of PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const url = /^https?:\/\//.test(text) ? text : `https://${text}`;
      return { ok: true, url, videoId: match[1] };
    }
  }
  return { ok: false, reason: /youtube\.com|youtu\.be/.test(text) ? 'invalid' : 'not_youtube' };
}

export const URL_HINT: Record<'not_youtube' | 'invalid', string> = {
  not_youtube: '아직 YouTube Shorts만 지원해요.',
  invalid: 'YouTube Shorts 링크가 맞는지 확인해 주세요.',
};
