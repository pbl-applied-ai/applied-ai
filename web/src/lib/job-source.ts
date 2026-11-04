// job을 만든 링크를 브라우저 탭에 잠깐 기억한다. 처리 중 화면의 영상 표시와 [다시 시도]에 쓴다.
// 업로드한 파일은 "file:<파일 이름>"으로 기억한다. 원본은 처리 뒤 지워지므로 [다시 시도]는 없다.
// jobs API가 원본 링크를 함께 내려주게 되면 이 파일은 없앤다.
const key = (jobId: string) => `job-source:${jobId}`;

export function rememberJobSource(jobId: string, sourceUrl: string) {
  try {
    sessionStorage.setItem(key(jobId), sourceUrl);
  } catch {
    // 저장소를 못 쓰면 [다시 시도] 대신 [다른 링크]만 보인다.
  }
}

const FILE_PREFIX = "file:";

export const fileSource = (fileName: string) => `${FILE_PREFIX}${fileName}`;

/** 업로드한 파일이면 파일 이름, 링크면 null */
export function sourceFileName(source: string | null): string | null {
  return source?.startsWith(FILE_PREFIX) ? source.slice(FILE_PREFIX.length) : null;
}

export function recallJobSource(jobId: string): string | null {
  try {
    return sessionStorage.getItem(key(jobId));
  } catch {
    return null;
  }
}
