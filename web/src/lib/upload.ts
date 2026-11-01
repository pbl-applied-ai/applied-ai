// S2 [영상 파일로 넣기]에서 고른 파일 검사(KAN-49). 서버(uploads 버킷·음성 인식)와 같은 기준이다.
// 25MB는 음성 인식 API 한도, 확장자는 supabase/migrations의 uploads 정책과 같다.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, UploadExt> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
};
const EXTS = ['mp4', 'mov', 'webm', 'm4v'] as const;
export type UploadExt = (typeof EXTS)[number];

// 파일 고르기 창에서 보여 줄 형식
export const UPLOAD_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v';

export type UploadCheck =
  | { ok: true; ext: UploadExt; mime: string }
  | { ok: false; reason: 'empty' | 'type' | 'size' };

export const UPLOAD_ERROR_TEXT: Record<'empty' | 'type' | 'size', string> = {
  empty: '빈 파일이에요. 다른 파일을 골라 주세요.',
  type: 'mp4·mov·webm 영상만 올릴 수 있어요.',
  size: '25MB 이하 영상만 올릴 수 있어요.',
};

// 브라우저가 형식을 비워 두는 경우가 있어 확장자로도 확인한다.
export function checkUploadFile(file: Pick<File, 'name' | 'size' | 'type'>): UploadCheck {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? '';
  const ext = EXT_BY_TYPE[file.type] ?? (EXTS as readonly string[]).find((e) => e === fromName);
  if (!ext) return { ok: false, reason: 'type' };
  if (file.size === 0) return { ok: false, reason: 'empty' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'size' };
  // 브라우저가 목록에 없는 형식(application/octet-stream 등)을 주면 버킷이 거부하므로 확장자로 정한다
  const mime = EXT_BY_TYPE[file.type] ? file.type : ext === 'mov' ? 'video/quicktime' : ext === 'm4v' ? 'video/x-m4v' : `video/${ext}`;
  return { ok: true, ext: ext as UploadExt, mime };
}
