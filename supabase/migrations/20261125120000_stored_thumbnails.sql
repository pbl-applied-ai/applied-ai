-- 썸네일 저장 (11/24 수빈 결정, #57 5절 "이미지를 받아 저장하지 않는다"를 바꿈).
-- Instagram 커버 이미지 주소는 업체가 준 링크라 시간이 지나면 만료되고, 업로드는 원본이 없다.
-- 그래서 워커가 변환할 때 한 장을 받아 공개 버킷 thumbnails에 둔다(pipeline/src/worker.mjs thumbnailPath).
--   instagram:<code> → thumbnails/instagram/<code>.jpg  (업체가 준 커버 이미지)
--   upload:<id>      → thumbnails/upload/<id>.jpg       (화면 글자 읽기 때 뽑은 프레임 하나)
-- YouTube는 지금처럼 영상 ID로 i.ytimg.com 주소를 만들고 저장하지 않는다.

-- 공개 읽기 버킷. 쓰기 정책은 두지 않아서 service role(워커)만 올린다.
insert into storage.buckets (id, name, public) values ('thumbnails', 'thumbnails', true)
on conflict (id) do update set public = true;

-- 크기·형식 제한 열은 Storage 서비스가 만든다. DB만 띄우는 CI에는 없을 수 있어 있을 때만 쓴다(20261031120000과 같음).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets
    set file_size_limit = 2097152,
        allowed_mime_types = array['image/jpeg']
    where id = 'thumbnails';
  end if;
end;
$$;

-- Instagram·업로드는 저장한 파일 경로를 준다. 프로젝트 주소는 DB가 모르니 '/storage/...'로 시작하는
-- 상대 경로이고, 화면이 NEXT_PUBLIC_SUPABASE_URL을 앞에 붙인다(web/src/lib/thumbnail.ts).
-- 예전 run이나 커버를 못 받은 run은 파일이 없다 → 이미지가 안 열리면 화면이 줄무늬 칸으로 바꾼다.
-- 시그니처가 같아서 list_featured·get_run·list_my_recipes 같은 RPC는 그대로 쓴다. 권한(revoke)도 그대로 남는다.
create or replace function public.run_thumbnail(p_canonical_key text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_canonical_key ~ '^youtube:[A-Za-z0-9_-]{11}$'
      then 'https://i.ytimg.com/vi/' || substr(p_canonical_key, 9) || '/hqdefault.jpg'
    when p_canonical_key ~ '^instagram:[A-Za-z0-9_-]+$'
      then '/storage/v1/object/public/thumbnails/instagram/' || substr(p_canonical_key, 11) || '.jpg'
    when p_canonical_key ~ '^upload:[0-9a-f-]{36}$'
      then '/storage/v1/object/public/thumbnails/upload/' || substr(p_canonical_key, 8) || '.jpg'
  end
$$;
