-- 썸네일 저장(20261125120000): 공개 버킷, 경로 규칙은 pipeline/src/worker.mjs thumbnailPath와 같다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is((select public from storage.buckets where id = 'thumbnails'), true, 'thumbnails 버킷은 공개 읽기');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and (coalesce(qual, '') || coalesce(with_check, '')) like '%thumbnails%'), 0,
  '쓰기 정책이 없어서 워커(service role)만 올린다');
select is(public.run_thumbnail('youtube:Smpl0Gochu1'), 'https://i.ytimg.com/vi/Smpl0Gochu1/hqdefault.jpg', 'YouTube는 그대로');
select is(public.run_thumbnail('instagram:Smpl0Reel01'), '/storage/v1/object/public/thumbnails/instagram/Smpl0Reel01.jpg', 'Instagram 경로');
select is(public.run_thumbnail('upload:cccccccc-0000-0000-0000-000000000002'),
  '/storage/v1/object/public/thumbnails/upload/cccccccc-0000-0000-0000-000000000002.jpg', '업로드 경로');
select is(public.run_thumbnail('instagram:../x'), null, '경로에 못 쓰는 글자는 썸네일 없음');

select * from finish();
rollback;
