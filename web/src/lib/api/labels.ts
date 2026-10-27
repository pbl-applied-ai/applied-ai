// 처리 단계·실패 안내 문구. Figma "S3 실패 안내 문구표 · 수정안"(7종, #14 기준) 그대로.
// https://www.figma.com/design/6MU7IzjIHSHV6eMlJHcKnZ/Applied-AI?node-id=13-111
import type { Job, JobErrorCode, JobStage } from './types';

export const STAGE_LABEL: Record<JobStage, string | null> = {
  collect: '영상 정보 가져오는 중',
  asr: '음성 듣는 중',
  ocr: '화면 글자 읽는 중',
  structure: '레시피 정리 중',
  finalize: null, // 표시하지 않는다
};

export type FailAction = 'retry' | 'upload' | 'other_link' | 'show_partial' | 'go_book';

export interface ErrorGuide {
  title: string;
  body?: string;
  actions: FailAction[]; // 첫 번째가 주 버튼
}

export const ACTION_LABEL: Record<FailAction, string> = {
  retry: '다시 시도',
  upload: '영상 파일로 넣기',
  other_link: '다른 링크',
  show_partial: '찾은 만큼 보기',
  go_book: '레시피북으로',
};

// 문구표 7종. 키는 error_code·reason 조합이다
export const FAIL_GUIDE = {
  retryable: { title: '잠시 문제가 생겼어요', actions: ['retry', 'other_link'] },
  not_playable: { title: '이 영상은 열 수 없어요', actions: ['upload', 'other_link'] },
  no_captions: {
    title: '이 영상은 자막이 없어서 읽을 수 없어요',
    body: '지금은 자막이 있는 영상만 레시피로 만들 수 있어요. 다른 영상을 넣어 주세요.',
    actions: ['other_link', 'upload'],
  },
  not_a_recipe: { title: '요리 영상이 아닌 것 같아요', actions: ['other_link'] },
  partial_recipe: { title: '영상에서 찾은 정보가 적어요', actions: ['show_partial', 'other_link'] },
  empty_recipe: { title: '영상에서 레시피를 찾지 못했어요', actions: ['other_link', 'upload'] },
  internal: { title: '서비스에 문제가 생겼어요', actions: ['retry', 'go_book'] },
  // 문구표에 없음. 화면 원본(4-132)의 unsupported_source 문구를 쓴다
  unsupported_source: {
    title: '이 영상은 링크로 가져올 수 없어요',
    body: '지금은 YouTube Shorts만 지원해요.',
    actions: ['upload', 'other_link'],
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
};

const BY_CODE: Record<JobErrorCode, FailGuideKey> = {
  retryable: 'retryable',
  unavailable: 'not_playable',
  unsupported_source: 'unsupported_source',
  not_a_recipe: 'not_a_recipe',
  insufficient: 'empty_recipe',
  internal: 'internal',
};

export function failGuide(job: Pick<Job, 'errorCode' | 'reason'>): ErrorGuide | null {
  if (!job.errorCode) return null;
  const key = (job.reason && BY_REASON[job.reason]) || BY_CODE[job.errorCode];
  return FAIL_GUIDE[key];
}
