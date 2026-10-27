-- 로그인 사용자는 내 job·내 레시피만 본다. 레시피 저장(insert·update)은 KAN-22 RPC로만 연다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create function pg_temp.login_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.delete_recipe(rid uuid) returns bigint language plpgsql as $$
declare n bigint;
begin
  delete from public.user_recipes where id = rid;
  get diagnostics n = row_count;
  return n;
end $$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
insert into public.runs (id, canonical_key, source_url, extractor_version, bundle, recipe)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'youtube:Smpl0Gochu1', 'https://www.youtube.com/shorts/Smpl0Gochu1',
        '{"pipeline": "0.1.0+abc1234"}', '{}', '{}');
insert into public.jobs (id, source_url, requested_by, message) values
  ('bbbbbbbb-0000-0000-0000-00000000000a', 'https://www.youtube.com/shorts/Smpl0Gochu1',
   '11111111-1111-1111-1111-111111111111', '원문 오류'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'https://www.youtube.com/shorts/Smpl0Gochu1',
   '22222222-2222-2222-2222-222222222222', null);
insert into public.user_recipes (id, user_id, run_id, title, ingredients, steps) values
  ('cccccccc-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'A의 덮밥', '[]', '[]'),
  ('cccccccc-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222',
   'aaaaaaaa-0000-0000-0000-000000000001', 'B의 덮밥', '[]', '[]');

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');

select results_eq($$ select id from public.jobs $$,
                  $$ values ('bbbbbbbb-0000-0000-0000-00000000000a'::uuid) $$, '내 job만 보인다');
select throws_ok($$ select message from public.jobs $$, '42501', null, 'jobs.message는 못 읽는다');
select results_eq($$ select id from public.user_recipes $$,
                  $$ values ('cccccccc-0000-0000-0000-00000000000a'::uuid) $$, '내 레시피만 보인다');
select is(pg_temp.delete_recipe('cccccccc-0000-0000-0000-00000000000b'), 0::bigint, '남의 레시피는 지워지지 않는다');
select throws_ok(
  $$ insert into public.user_recipes (run_id, title, ingredients, steps)
     values ('aaaaaaaa-0000-0000-0000-000000000001', '직접 저장', '[]', '[]') $$,
  '42501', null, '레시피를 테이블에 직접 넣을 수 없다');
select throws_ok(
  $$ update public.user_recipes set title = '고침' where id = 'cccccccc-0000-0000-0000-00000000000a' $$,
  '42501', null, '레시피를 테이블에서 직접 고칠 수 없다');
select is(pg_temp.delete_recipe('cccccccc-0000-0000-0000-00000000000a'), 1::bigint, '내 레시피는 지운다');

reset role;
select is((select count(*) from public.user_recipes where id = 'cccccccc-0000-0000-0000-00000000000b'), 1::bigint,
          'B의 레시피는 그대로다');

-- updated_at 자동 갱신
update public.jobs set created_at = '2000-01-01', updated_at = '2000-01-01'
 where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
update public.jobs set stage = 'collect' where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
select is((select updated_at from public.jobs where id = 'bbbbbbbb-0000-0000-0000-00000000000b'), now(),
          'jobs.updated_at이 갱신된다');
select is((select created_at from public.jobs where id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
          '2000-01-01'::timestamptz, 'created_at은 그대로다');

select * from finish();
rollback;
