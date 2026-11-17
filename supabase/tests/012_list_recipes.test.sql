-- 레시피북 목록 list_recipes(KAN-73, docs/screen-data.md 7절 3번): 내 레시피만, 최근 저장 순, 카드 정보, 개수·카테고리 거르기.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create function pg_temp.login_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

insert into public.runs (id, canonical_key, source_url, extractor_version, bundle, recipe) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'youtube:Smpl0Gochu1', 'https://www.youtube.com/shorts/Smpl0Gochu1',
   '{"pipeline": "0.1.0+abc1234"}', '{}', '{"title": "덮밥", "ingredients": [], "steps": []}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'upload:cccccccc-0000-0000-0000-000000000002', 'upload:cccccccc-0000-0000-0000-000000000002',
   '{"pipeline": "0.1.0+abc1234"}', '{}', '{"title": "업로드", "ingredients": [], "steps": []}');

insert into public.user_recipes (id, user_id, run_id, title, ingredients, steps, created_at, updated_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '내 덮밥',
   '[{"id": "ing-1", "name": "고추장", "amount_raw": "2큰술", "amount_status": "confirmed", "edited": false, "user_entered": false},
     {"id": "ing-2", "name": "소금", "amount_raw": null, "amount_status": "unconfirmed", "edited": false, "user_entered": false},
     {"id": "ing-3", "name": "설탕", "amount_raw": "", "amount_status": "unconfirmed", "edited": false, "user_entered": false}]',
   '[{"id": "step-1", "text": "볶는다", "edited": false, "user_entered": false},
     {"id": "step-2", "text": "담는다", "edited": false, "user_entered": false}]',
   '2026-11-01T00:00:00Z', '2026-11-03T00:00:00Z'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', '업로드 레시피',
   '[]', '[]', '2026-11-02T00:00:00Z', '2026-11-02T00:00:00Z'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', '남의 덮밥',
   '[]', '[]', '2026-11-05T00:00:00Z', '2026-11-05T00:00:00Z');

insert into public.categories (id, user_id, name, emoji) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Late night', '🌙');
insert into public.recipe_categories (recipe_id, category_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001');

-- 로그인 없이
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select * from public.list_recipes() $$, '42501', null, '로그인 없이는 부를 수 없다');
select throws_ok($$ select * from public.categories $$, '42501', null, '카테고리 표는 웹에서 직접 읽지 못한다');
reset role;

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');

select is((select array_agg(id::text) from public.list_recipes()),
  array['bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001'], '내 레시피만, 최근 저장 순');
select is((select array[ingredient_count, step_count, unconfirmed_count] from public.list_recipes() where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  array[3, 2, 2], '재료 수·단계 수·분량 빈 재료 수');
select is((select source_url from public.list_recipes() where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'https://www.youtube.com/shorts/Smpl0Gochu1', '원본 링크');
select is((select platform from public.list_recipes() where id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'upload', '업로드는 platform upload');
select is((select thumbnail_url from public.list_recipes() where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'https://i.ytimg.com/vi/Smpl0Gochu1/hqdefault.jpg', 'YouTube 썸네일');
select is((select thumbnail_url from public.list_recipes() where id = 'bbbbbbbb-0000-0000-0000-000000000002'), null, '업로드는 썸네일 없음');
select is((select category_ids from public.list_recipes() where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  array['dddddddd-0000-0000-0000-000000000001'::uuid], '카테고리 ID');
select is((select updated_at from public.list_recipes() where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  '2026-11-03T00:00:00Z'::timestamptz, '수정일');
select is((select count(*)::int from public.list_recipes(1)), 1, 'p_limit');
select is((select array_agg(id::text) from public.list_recipes(null, 'dddddddd-0000-0000-0000-000000000001')),
  array['bbbbbbbb-0000-0000-0000-000000000001'], '카테고리로 거르기');
reset role;

select * from finish();
rollback;
