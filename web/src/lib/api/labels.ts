// 처리 단계·실패 안내 문구. 제목·버튼 구성은 Figma "S3 실패 안내 문구표 · 수정안"(7종, #14 기준)을 따른다.
// 단, other_link 버튼 이름은 S2 링크 입력으로 돌아간다는 뜻이 드러나게 "다른 링크 넣기"로 바꿨다.
// 설명(body)은 문구표에 칸이 없어 #15 처리 중 화면 문구를 쓴다.
// https://www.figma.com/design/6MU7IzjIHSHV6eMlJHcKnZ/Applied-AI?node-id=13-111
import type { Job, JobErrorCode, JobStage } from './types';

export const STAGE_LABEL: Record<JobStage, string | null> = {
  collect: 'Getting the video',
  asr: 'Listening to the audio',
  ocr: 'Reading on-screen text & captions',
  structure: 'Writing the recipe',
  finalize: null, // 표시하지 않는다
};

// other_file은 업로드한 파일이 실패했을 때 [영상 파일로 넣기] 대신 쓴다(UX 플로우 S3)
export type FailAction = 'retry' | 'upload' | 'other_file' | 'other_link' | 'show_partial' | 'go_home';

export interface ErrorGuide {
  title: string;
  body?: string;
  actions: FailAction[]; // 첫 번째가 주 버튼
}

export const ACTION_LABEL: Record<FailAction, string> = {
  retry: 'Try again',
  upload: 'Upload a video file',
  other_file: 'Upload a different file',
  other_link: 'Try another link',
  show_partial: 'See what we found',
  go_home: 'Back to home', // 로그인 전에도 홈의 "만드는 중" 카드로 돌아올 수 있다(KAN-56)
};

// 문구표 7종. 키는 error_code·reason 조합이다
export const FAIL_GUIDE = {
  retryable: {
    title: 'Something went wrong',
    body: 'We tried a few times, but it didn\'t work.\nPlease try again in a bit.',
    actions: ['retry', 'other_link'],
  },
  not_playable: {
    title: 'We can\'t open this video',
    body: 'It may be private or deleted.\nTry a link to a different video.',
    actions: ['upload', 'other_link'],
  },
  no_captions: {
    title: 'This video has no captions we can read',
    body: 'For now, we can only make recipes from videos with captions.\nTry a different video.',
    actions: ['other_link', 'upload'],
  },
  not_a_recipe: {
    title: 'This doesn\'t look like a cooking video',
    body: 'Paste a link to a cooking Short or Reel\nthat shows a recipe.',
    actions: ['other_link'],
  },
  partial_recipe: {
    title: 'We only found part of the recipe',
    body: 'We\'ll show you what we found.\nYou can fill in the rest yourself.',
    actions: ['show_partial', 'other_link'],
  },
  empty_recipe: {
    title: 'We couldn\'t find a recipe in this video',
    body: 'We couldn\'t find any ingredients or steps.\nTry a different video.',
    actions: ['other_link', 'upload'],
  },
  internal: {
    title: 'Something went wrong on our end',
    body: 'It\'s not you, it\'s us.\nPlease try again in a bit.',
    actions: ['retry', 'go_home'],
  },
  // 문구표에 없음. 화면 원본(4-132)의 unsupported_source 문구를 쓴다
  unsupported_source: {
    title: 'We can\'t get this video from a link',
    body: 'For now, we only support YouTube Shorts and Instagram Reels.',
    actions: ['upload', 'other_link'],
  },
  // Instagram 실패(KAN-62). docs/ux-flow.md S3 "Instagram 실패 사유별 안내". 삭제·비공개(ig_not_found·ig_blocked)는 not_playable과 같다
  ig_not_video: {
    title: 'We can only get Reels videos',
    body: 'This post is a photo or a slideshow.\nTry a link to a Reel.',
    actions: ['other_link', 'upload'],
  },
  no_media_no_caption: {
    title: 'We couldn\'t read a recipe from this video',
    body: 'There was no talking, on-screen text or caption we could use.\nTry a different video.',
    actions: ['other_link', 'upload'],
  },
  // 수집 업체가 잠깐 안 되는 것(vendor_transient)을 다시 시도까지 다 쓴 경우. 영상 탓으로 보이지 않게 따로 둔다
  instagram_down: {
    title: 'We can\'t get Instagram videos right now',
    body: 'Please try again in a bit.',
    actions: ['upload', 'other_link'],
  },
  // 업로드 실패(KAN-49). 화면 원본에 없어 UX 플로우 S3 "업로드한 파일 실패" 기준으로 썼다
  no_speech: {
    title: 'We couldn\'t hear anyone talking',
    body: 'For now, we can only read videos where someone talks through the recipe.\nReading on-screen text is coming soon.',
    actions: ['other_file', 'other_link'],
  },
  upload_too_large: {
    title: 'This file is too big',
    body: 'Videos must be 25MB or smaller.',
    actions: ['other_file', 'other_link'],
  },
  upload_unreadable: {
    title: 'We can\'t read this video file',
    body: 'The file may be damaged or have no sound.\nTry uploading a different file.',
    actions: ['other_file', 'other_link'],
  },
} satisfies Record<string, ErrorGuide>;

export type FailGuideKey = keyof typeof FAIL_GUIDE;

// reason이 있으면 reason으로, 없으면 error_code로 고른다.
// 자막 없음은 #14에서 unavailable(no_captions_no_description)로, Figma에서 insufficient(no_captions)로 적혀 있어 둘 다 받는다.
const BY_REASON: Record<string, FailGuideKey> = {
  not_playable: 'not_playable',
  caption_blocked: 'not_playable',
  no_captions: 'no_captions',
  no_captions_no_description: 'no_captions',
  partial_recipe: 'partial_recipe',
  empty_recipe: 'empty_recipe',
  no_speech: 'no_speech',
  upload_too_large: 'upload_too_large',
  upload_unreadable: 'upload_unreadable',
  upload_missing: 'upload_unreadable',
  ig_not_found: 'not_playable',
  ig_blocked: 'not_playable',
  ig_not_video: 'ig_not_video',
  no_media_no_caption: 'no_media_no_caption',
  vendor_transient: 'instagram_down',
  vendor_quota: 'internal', // 업체 크레딧·키 문제. 원인은 말하지 않는다
  vendor_config: 'internal',
};

const BY_CODE: Record<JobErrorCode, FailGuideKey> = {
  retryable: 'retryable',
  unavailable: 'not_playable',
  unsupported_source: 'unsupported_source',
  not_a_recipe: 'not_a_recipe',
  insufficient: 'empty_recipe',
  internal: 'internal',
};

// 응답은 런타임 값이라 모르는 error_code·reason이 올 수 있다. 그때는 일시 오류 안내로 보낸다.
export function failGuide(job: Pick<Job, 'errorCode' | 'reason'>): ErrorGuide {
  const key = (job.reason && BY_REASON[job.reason]) || (job.errorCode && BY_CODE[job.errorCode]) || 'retryable';
  return FAIL_GUIDE[key] ?? FAIL_GUIDE.retryable;
}
