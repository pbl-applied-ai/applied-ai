// 처리 단계·실패 안내 문구. 제목·버튼 구성은 Figma "S3 실패 안내 문구표 · 수정안"(7종, #14 기준)을 따른다.
// 단, other_link 버튼 이름은 S2 링크 입력으로 돌아간다는 뜻이 드러나게 "다른 링크 넣기"로 바꿨다.
// 설명(body)은 문구표에 칸이 없어 #15 처리 중 화면 문구를 쓴다.
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
  other_link: '다른 링크 넣기',
  show_partial: '찾은 만큼 보기',
  go_book: '레시피북으로',
};

// 문구표 7종. 키는 error_code·reason 조합이다
export const FAIL_GUIDE = {
  retryable: {
    title: '잠시 문제가 생겼어요',
    body: '몇 번 다시 시도했지만 실패했어요.\n조금 뒤에 다시 시도해 주세요.',
    actions: ['retry', 'other_link'],
  },
  not_playable: {
    title: '이 영상은 열 수 없어요',
    body: '비공개이거나 삭제된 영상일 수 있어요.\n다른 영상 링크를 넣어 주세요.',
    actions: ['upload', 'other_link'],
  },
  no_captions: {
    title: '이 영상은 자막이 없어서 읽을 수 없어요',
    body: '지금은 자막이 있는 영상만 레시피로 만들 수 있어요.\n다른 영상을 넣어 주세요.',
    actions: ['other_link', 'upload'],
  },
  not_a_recipe: {
    title: '요리 영상이 아닌 것 같아요',
    body: '레시피가 담긴 요리 Shorts 링크를\n넣어 주세요.',
    actions: ['other_link'],
  },
  partial_recipe: {
    title: '영상에서 찾은 정보가 적어요',
    body: '찾은 내용만 보여 드릴게요.\n빠진 부분은 직접 채울 수 있어요.',
    actions: ['show_partial', 'other_link'],
  },
  empty_recipe: {
    title: '영상에서 레시피를 찾지 못했어요',
    body: '재료와 조리 순서를 찾지 못했어요.\n다른 영상으로 다시 해 보세요.',
    actions: ['other_link', 'upload'],
  },
  internal: {
    title: '서비스에 문제가 생겼어요',
    body: '저희 쪽 문제예요.\n잠시 뒤에 다시 시도해 주세요.',
    actions: ['retry', 'go_book'],
  },
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

// 응답은 런타임 값이라 모르는 error_code·reason이 올 수 있다. 그때는 일시 오류 안내로 보낸다.
export function failGuide(job: Pick<Job, 'errorCode' | 'reason'>): ErrorGuide {
  const key = (job.reason && BY_REASON[job.reason]) || (job.errorCode && BY_CODE[job.errorCode]) || 'retryable';
  return FAIL_GUIDE[key] ?? FAIL_GUIDE.retryable;
}
