-- 레시피 저장·수정·상세(KAN-23): 서버가 상태를 다시 정하는지, 남의 레시피를 건드릴 수 없는지 본다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create function pg_temp.login_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
insert into public.runs (id, canonical_key, source_url, extractor_version, bundle, recipe) values (
  'aaaaaaaa-0000-0000-0000-000000000001', 'youtube:Smpl0Gochu1', 'https://www.youtube.com/shorts/Smpl0Gochu1',
  '{"pipeline": "0.1.0+abc1234"}', '{}',
  '{"title": "덮밥",
    "ingredients": [
      {"name": "고추장", "amount_raw": "2큰술", "amount_status": "confirmed", "evidence": []},
      {"name": "소금", "amount_raw": null, "amount_status": "unconfirmed", "evidence": []}
    ],
    "steps": [
      {"order": 2, "text": "볶는다", "evidence": []},
      {"order": 1, "text": "썬다", "evidence": []}
    ]}');

-- 로그인 없이
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.save_recipe('aaaaaaaa-0000-0000-0000-000000000001', 't', null, '[]', '[]') $$,
  '42501', null, '로그인 없이는 저장할 수 없다');
reset role;

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');

-- 클라이언트가 confirmed·edited false로 보내도 서버가 다시 정한다
select lives_ok($q$
  select set_config('test.recipe_id', public.save_recipe(
    'aaaaaaaa-0000-0000-0000-000000000001', ' 내 덮밥 ', '2인분',
    '[{"id": "ing-1", "name": "고추장", "amount_raw": "2큰술", "amount_status": "unconfirmed", "edited": true, "user_entered": true},
      {"id": "ing-2", "name": "소금", "amount_raw": "1스푼", "amount_status": "confirmed", "edited": false, "user_entered": false},
      {"id": "ing-user-1", "name": "참기름", "amount_raw": null, "amount_status": "confirmed", "edited": false, "user_entered": false},
      {"id": "ing-user-2", "name": "  ", "amount_raw": null}]',
    '[{"id": "step-2", "text": "볶는다"}, {"id": "step-1", "text": "잘게 썬다"}, {"id": "step-user-1", "text": "담는다"}]'
  )::text, true)
$q$, '저장된다');

select is((select title from public.user_recipes), '내 덮밥', '제목 앞뒤 공백은 지운다');
select is((select jsonb_array_length(ingredients) from public.user_recipes), 3, '이름이 빈 재료는 저장하지 않는다');

select is((select ingredients -> 0 from public.user_recipes),
  '{"id": "ing-1", "name": "고추장", "amount_raw": "2큰술", "amount_status": "confirmed", "edited": false, "user_entered": false}'::jsonb,
  '원본과 같은 분량은 confirmed, 수정 아님');
select is((select ingredients -> 1 ->> 'amount_status' from public.user_recipes), 'unconfirmed', '원본에 없던 분량은 confirmed가 될 수 없다');
select is((select ingredients -> 1 -> 'user_entered' from public.user_recipes), 'true'::jsonb, '사용자가 채운 분량은 user_entered');
select is((select ingredients -> 2 ->> 'amount_status' from public.user_recipes), 'unconfirmed', '추가한 재료는 confirmed가 될 수 없다');
select is((select ingredients -> 2 -> 'edited' from public.user_recipes), 'true'::jsonb, '추가한 재료는 수정 표시');

select is((select steps -> 0 ->> 'id' from public.user_recipes), 'step-2', '단계는 보낸 순서로 저장한다');
select is((select steps -> 0 -> 'edited' from public.user_recipes), 'false'::jsonb, 'step-2는 order 2번째 원본(볶는다)과 같다');
select is((select steps -> 1 -> 'edited' from public.user_recipes), 'true'::jsonb, '문장이 바뀐 단계는 수정 표시');
select is((select steps -> 2 -> 'user_entered' from public.user_recipes), 'true'::jsonb, '추가한 단계는 user_entered');

-- 같은 영상을 또 저장하면 덮어쓴다
select is(
  public.save_recipe('aaaaaaaa-0000-0000-0000-000000000001', '다시', null,
    '[{"id": "ing-1", "name": "고추장", "amount_raw": "2큰술"}]', '[{"id": "step-1", "text": "썬다"}]')::text,
  current_setting('test.recipe_id'), '같은 영상을 또 저장하면 기존 레시피를 고친다');

-- 입력 검사
select throws_ok(
  $$ select public.save_recipe('aaaaaaaa-0000-0000-0000-000000000001', '제목', null, '[]', '[{"id": "step-1", "text": "썬다"}]') $$,
  '22023', 'recipe needs ingredients and steps', '재료가 없으면 저장할 수 없다');
select throws_ok(
  $$ select public.save_recipe('aaaaaaaa-0000-0000-0000-000000000001', '제목', null,
       '[{"id": "ing-1", "name": "a"}, {"id": "ing-1", "name": "b"}]', '[{"id": "step-1", "text": "썬다"}]') $$,
  '22023', 'invalid ingredient id', '같은 항목 ID를 두 번 쓸 수 없다');
select throws_ok(
  $$ select public.save_recipe('aaaaaaaa-0000-0000-0000-00000000ffff', '제목', null, '[]', '[]') $$,
  'P0002', 'run not found', '없는 결과는 저장할 수 없다');

-- 수정·상세
select lives_ok(format($q$
  select public.update_recipe(%L, '고친 제목', null,
    '[{"id": "ing-1", "name": "고추장", "amount_raw": "3큰술"}]', '[{"id": "step-1", "text": "썬다"}]')
$q$, current_setting('test.recipe_id')), '내 레시피는 고칠 수 있다');
select is((select ingredients -> 0 ->> 'amount_status' from public.user_recipes), 'unconfirmed', '수정에서도 바뀐 분량은 unconfirmed');
select is((select source_url from public.get_recipe(current_setting('test.recipe_id')::uuid)),
  'https://www.youtube.com/shorts/Smpl0Gochu1', '상세는 원본 링크를 함께 준다');

-- 다른 사용자
select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
select is_empty(format($q$ select * from public.get_recipe(%L) $q$, current_setting('test.recipe_id')), '남의 레시피는 상세로 못 본다');
select throws_ok(format($q$
  select public.update_recipe(%L, '가로채기', null,
    '[{"id": "ing-1", "name": "a"}]', '[{"id": "step-1", "text": "b"}]')
$q$, current_setting('test.recipe_id')), 'P0002', 'recipe not found', '남의 레시피는 고칠 수 없다');

select * from finish();
rollback;
