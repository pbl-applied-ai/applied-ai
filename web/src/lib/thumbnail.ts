// 썸네일 주소. YouTube는 영상 ID로 만들고, Instagram·업로드는 워커가 Supabase Storage 공개 버킷에 저장해 둔
// 파일을 쓴다(11/24 수빈 결정, supabase/migrations/20261125120000_stored_thumbnails.sql).
// 예전 run이나 커버를 못 받은 run은 파일이 없다 → <Thumb>가 이미지가 안 열리면 줄무늬 칸으로 바꾼다.
import { checkShortsUrl, sourceThumbnail } from "./shorts";

const STORAGE_PREFIX = "/storage/v1/object/public/thumbnails/";
const UPLOAD_SOURCE = /^upload:([0-9a-f-]{36})$/;

/** RPC(run_thumbnail)가 준 값. '/storage/...'로 시작하는 상대 경로면 Supabase 주소를 앞에 붙인다. */
export function resolveThumbnail(value: string | null | undefined, supabaseUrl: string): string | null {
  if (!value) return null;
  return value.startsWith("/") ? `${supabaseUrl.replace(/\/$/, "")}${value}` : value;
}

/** 원본 링크(업로드면 'upload:<id>')로 만든 썸네일 주소. run_thumbnail과 같은 규칙이다. */
export function thumbnailForSource(sourceUrl: string | null | undefined, supabaseUrl: string): string | null {
  if (!sourceUrl) return null;
  const upload = UPLOAD_SOURCE.exec(sourceUrl)?.[1];
  if (upload) return resolveThumbnail(`${STORAGE_PREFIX}upload/${upload}.jpg`, supabaseUrl);
  const check = checkShortsUrl(sourceUrl);
  if (check.ok && check.platform === "instagram") return resolveThumbnail(`${STORAGE_PREFIX}instagram/${check.videoId}.jpg`, supabaseUrl);
  return sourceThumbnail(sourceUrl);
}
