// job을 만든 링크를 브라우저 탭에 잠깐 기억한다. 처리 중 화면의 영상 표시와 [다시 시도]에 쓴다.
// jobs API가 원본 링크를 함께 내려주게 되면 이 파일은 없앤다.
const key = (jobId: string) => `job-source:${jobId}`;

export function rememberJobSource(jobId: string, sourceUrl: string) {
  try {
    sessionStorage.setItem(key(jobId), sourceUrl);
  } catch {
    // 저장소를 못 쓰면 [다시 시도] 대신 [다른 링크]만 보인다.
  }
}

export function recallJobSource(jobId: string): string | null {
  try {
    return sessionStorage.getItem(key(jobId));
  } catch {
    return null;
  }
}
