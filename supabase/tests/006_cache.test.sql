-- 캐시 조회(docs/worker-interface.md 3번): 같은 canonical_key + extractor_version의 성공 run만.
-- partial run과 로컬 실행(+dev)은 재사용하지 않는다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.runs (id, canonical_key, source_url, extractor_version, bundle, recipe, partial, created_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'youtube:A', 'https://www.youtube.com/shorts/A',
   '{"pipeline": "0.1.0+abc1234", "model": "gpt-4.1"}', '{}', '{}', false, now() - interval '2 hours'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'youtube:A', 'https://www.youtube.com/shorts/A',
   '{"pipeline": "0.1.0+abc1234", "model": "gpt-4.1"}', '{}', '{}', false, now() - interval '1 hour'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'youtube:A', 'https://www.youtube.com/shorts/A',
   '{"pipeline": "0.1.0+abc1234", "model": "gpt-4.1"}', '{}', '{}', true, now()),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'youtube:B', 'https://www.youtube.com/shorts/B',
   '{"pipeline": "0.1.0+dev", "model": "gpt-4.1"}', '{}', '{}', false, now()),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'youtube:C', 'https://www.youtube.com/shorts/C',
   '{"pipeline": "0.1.0+abc1234", "model": "gpt-4.1"}', '{}', '{}', true, now());

set local role service_role;

select is(public.find_cached_run('youtube:A', '{"pipeline": "0.1.0+abc1234", "model": "gpt-4.1"}'),
          'aaaaaaaa-0000-0000-0000-000000000002'::uuid, '가장 최근 성공 run(partial 제외)');
select is(public.find_cached_run('youtube:A', '{"model": "gpt-4.1", "pipeline": "0.1.0+abc1234"}'),
          'aaaaaaaa-0000-0000-0000-000000000002'::uuid, '키 순서가 달라도 같은 버전');
select is(public.find_cached_run('youtube:A', '{"pipeline": "0.1.0+def5678", "model": "gpt-4.1"}'),
          null, '버전이 다르면 없음');
select is(public.find_cached_run('youtube:B', '{"pipeline": "0.1.0+dev", "model": "gpt-4.1"}'),
          null, '로컬 실행(+dev) 결과는 재사용하지 않는다');
select is(public.find_cached_run('youtube:C', '{"pipeline": "0.1.0+abc1234", "model": "gpt-4.1"}'),
          null, 'partial run만 있으면 없음');
select is(public.find_cached_run('youtube:Z', '{"pipeline": "0.1.0+abc1234", "model": "gpt-4.1"}'),
          null, '처음 보는 영상은 없음');

select * from finish();
rollback;
