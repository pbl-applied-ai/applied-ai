-- 내 카테고리(KAN-73, docs/screen-data.md 7절 4번): 만들기·목록(개수)·레시피에 붙이기.
-- 남의 레시피나 남의 카테고리는 붙일 수 없다(#63 수빈 리뷰). 붙이는 건 RPC와 표 트리거가 둘 다 막는다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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
   '{"pipeline": "0.1.0+abc1234"}', '{}', '{"title": "덮밥", "ingredients": [], "steps": []}');
insert into public.user_recipes (id, user_id, run_id, title, ingredients, steps) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '내 덮밥', '[]', '[]'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', '남의 덮밥', '[]', '[]');
insert into public.categories (id, user_id, name) values
  ('dddddddd-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'B의 카테고리');

-- 로그인 없이
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select * from public.list_categories() $$, '42501', null, '로그인 없이는 목록을 못 본다');
select throws_ok($$ select * from public.create_category('Pasta', null) $$, '42501', null, '로그인 없이는 만들 수 없다');
reset role;

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');

select is((select name from public.create_category('  Late night ', '🌙')), 'Late night', '만들면 앞뒤 공백을 지운 이름');
select is((select emoji from public.list_categories() where name = 'Late night'), '🌙', '이모지');
select throws_ok($$ select * from public.create_category('late NIGHT', null) $$, '23505', null, '같은 이름(대소문자 무시)은 또 못 만든다');
select throws_ok($$ select * from public.create_category('   ', null) $$, '22023', null, '빈 이름은 안 된다');
select throws_ok($$ select * from public.create_category(repeat('가', 31), null) $$, '22023', null, '31자는 안 된다');
select lives_ok($$ select * from public.create_category('Pasta', '🍝') $$, '두 번째 카테고리');
select is((select array_agg(name order by name) from public.list_categories()), array['Late night', 'Pasta'], '내 카테고리만 보인다');

-- 붙이기
select lives_ok($$
  select public.set_recipe_categories('bbbbbbbb-0000-0000-0000-000000000001',
    array(select id from public.list_categories()))
$$, '내 레시피에 내 카테고리 두 개');
select is((select recipe_count from public.list_categories() where name = 'Pasta'), 1, '카테고리별 레시피 수');
select is((select cardinality(category_ids) from public.list_recipes() where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 2,
  'list_recipes에 카테고리 ID가 나온다');
select lives_ok($$ select public.set_recipe_categories('bbbbbbbb-0000-0000-0000-000000000001', '{}') $$, '빈 배열이면 다 뗀다');
select is((select recipe_count from public.list_categories() where name = 'Pasta'), 0, '뗀 뒤 개수 0');

select throws_ok($$ select public.set_recipe_categories('bbbbbbbb-0000-0000-0000-000000000002', '{}') $$,
  '42501', null, '남의 레시피에는 못 붙인다');
select throws_ok($$ select public.set_recipe_categories('bbbbbbbb-0000-0000-0000-000000000001', '{dddddddd-0000-0000-0000-000000000009}') $$,
  '42501', null, '남의 카테고리는 못 붙인다');
select lives_ok($$ select public.create_category('c' || g, null) from generate_series(1, 18) g $$, '20개까지는 만든다');
select throws_ok($$ select * from public.create_category('one too many', null) $$, '22023', null, '21번째는 안 된다');
reset role;

-- RPC를 거치지 않아도 표가 막는다
select throws_ok($$ insert into public.recipe_categories (recipe_id, category_id)
                    values ('bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000009') $$,
  '23514', null, '레시피와 카테고리 주인이 다르면 표에 들어가지 않는다');

select * from finish();
rollback;
