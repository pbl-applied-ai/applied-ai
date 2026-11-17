-- 홈 추천 목록(KAN-73, docs/screen-data.md 7절 1번): 팀이 고른 run만, 정한 순서로, 카드에 필요한 값을 준다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

insert into public.runs (id, canonical_key, source_url, extractor_version, bundle, recipe) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'youtube:Smpl0Ramen1', 'https://www.youtube.com/shorts/Smpl0Ramen1',
   '{"pipeline": "0.1.0+abc1234"}',
   '{"source": {"kind": "youtube", "channel": "@sample.kitchen", "duration_ms": 21000}, "segments": []}',
   '{"title": "Bacon egg ramen", "ingredients": [
      {"id": "ing-1", "name": "ramen noodles", "amount_raw": null, "amount_status": "unconfirmed", "evidence": []},
      {"id": "ing-2", "name": "egg yolk", "amount_raw": "1", "amount_status": "confirmed", "evidence": []},
      {"id": "ing-3", "name": "bacon", "amount_raw": null, "amount_status": "unconfirmed", "evidence": []}],
     "steps": [{"id": "step-1", "order": 1, "text": "Boil.", "evidence": []},
               {"id": "step-2", "order": 2, "text": "Top.", "evidence": []}]}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'instagram:Smpl0Reel02', 'https://www.instagram.com/reel/Smpl0Reel02/',
   '{"pipeline": "0.1.0+abc1234"}',
   '{"source": {"kind": "instagram", "channel": "sample.cook"}, "segments": []}',
   '{"title": "Grinch cookies", "ingredients": [
      {"id": "ing-1", "name": "flour", "amount_raw": "2 cups", "amount_status": "confirmed", "evidence": []}],
     "steps": [{"id": "step-1", "order": 1, "text": "Bake.", "evidence": []}]}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'youtube:Smpl0NotFt3', 'https://www.youtube.com/shorts/Smpl0NotFt3',
   '{"pipeline": "0.1.0+abc1234"}', '{}',
   '{"title": "추천 아님", "ingredients": [], "steps": []}');

-- 2번이 먼저(position 1), 1번이 다음(position 2). 3번은 추천이 아니다.
insert into public.featured_runs (run_id, categories, position) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '{quick,budget}', 2),
  ('aaaaaaaa-0000-0000-0000-000000000002', '{christmas}', 1);

-- 저장 수: 1번 run을 두 사람이 저장
insert into public.user_recipes (user_id, run_id, title, ingredients, steps) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'r', '[]', '[]'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'r', '[]', '[]');

select throws_ok(
  $$ insert into public.featured_runs (run_id, categories) values ('aaaaaaaa-0000-0000-0000-000000000003', '{pasta}') $$,
  '23514', null, '정한 카테고리 4개 밖은 넣을 수 없다');

set local role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok($$ select * from public.featured_runs $$, '42501', null, '추천 표는 웹에서 직접 읽지 못한다');

select is((select count(*)::int from public.list_featured()), 2, '추천으로 넣은 run만 나온다');
select is((select array_agg(run_id::text) from public.list_featured()),
  array['aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001'], 'position 순서');

select is((select title from public.list_featured() where run_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'Bacon egg ramen', '요리명');
select is((select creator from public.list_featured() where run_id = 'aaaaaaaa-0000-0000-0000-000000000001'), '@sample.kitchen', '크리에이터는 bundle 채널');
select is((select platform from public.list_featured() where run_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'youtube', '플랫폼 youtube');
select is((select platform from public.list_featured() where run_id = 'aaaaaaaa-0000-0000-0000-000000000002'), 'instagram', '플랫폼 instagram');
select is((select source_url from public.list_featured() where run_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'https://www.youtube.com/shorts/Smpl0Ramen1', '원본 링크');
select is((select duration_ms from public.list_featured() where run_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 21000::bigint, '영상 길이');
select is((select thumbnail_url from public.list_featured() where run_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'https://i.ytimg.com/vi/Smpl0Ramen1/hqdefault.jpg', 'YouTube는 썸네일 주소를 만든다');
select is((select thumbnail_url from public.list_featured() where run_id = 'aaaaaaaa-0000-0000-0000-000000000002'), null, 'Instagram은 썸네일 없음');
reset role;
insert into public.featured_runs (run_id, categories, position) values ('aaaaaaaa-0000-0000-0000-000000000003', '{}', 9);
update public.runs set canonical_key = 'upload:cccccccc-0000-0000-0000-000000000003', source_url = 'upload:cccccccc-0000-0000-0000-000000000003'
 where id = 'aaaaaaaa-0000-0000-0000-000000000003';
set local role anon;
select is((select source_url from public.list_featured() where run_id = 'aaaaaaaa-0000-0000-0000-000000000003'), null,
  '업로드 원본 주소는 null(#63 리뷰)');
select is((select ingredient_names from public.list_featured() where run_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  array['ramen noodles', 'egg yolk', 'bacon'], '재료 이름 전부, 순서대로');
select is((select array[ingredient_count, step_count] from public.list_featured() where run_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  array[3, 2], '재료 수·단계 수');
select is((select categories from public.list_featured() where run_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  array['quick', 'budget'], '카테고리');
select is((select array_agg(save_count order by position) from public.list_featured() f
             join (values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 1), ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 2)) p(run_id, position)
               using (run_id)),
  array[0, 2], '저장 수는 run을 저장한 사람 수');

reset role;
select * from finish();
rollback;
