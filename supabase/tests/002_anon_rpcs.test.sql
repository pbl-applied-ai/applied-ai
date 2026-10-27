-- 로그인 없이 쓰는 RPC: create_job 입력 검사, get_job·get_run이 내보내는 열.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.com');
insert into public.runs (id, canonical_key, source_url, extractor_version, bundle, recipe)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'youtube:Smpl0Gochu1', 'https://www.youtube.com/shorts/Smpl0Gochu1',
        '{"pipeline": "0.1.0+abc1234"}', '{"segments": []}', '{"title": "고추장 목살덮밥"}');
insert into public.run_internals (run_id, internal)
values ('aaaaaaaa-0000-0000-0000-000000000001', '{"secret": true}');

-- 익명
set local role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok($$ select public.create_job('ftp://example.com/x') $$, '22023', 'invalid source_url',
                 'http(s)가 아닌 주소는 거부');
select throws_ok($$ select public.create_job('') $$, '22023', 'invalid source_url', '빈 값은 거부');
select throws_ok($$ select public.create_job(null) $$, '22023', 'invalid source_url', 'null은 거부');
select throws_ok(format('select public.create_job(%L)', 'https://example.com/' || repeat('x', 2030)),
                 '22023', 'invalid source_url', '2048자를 넘는 주소는 거부');

select set_config('test.anon_job', public.create_job('https://www.youtube.com/shorts/Smpl0Gochu1')::text, true);
select is((select status from public.get_job(current_setting('test.anon_job')::uuid)), 'queued'::public.job_status,
          '익명도 자기 job 진행 상태를 본다');
select is((select partial from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')), false,
          '익명도 결과(run)를 본다');
select throws_ok($$ select count(*) from public.jobs $$, '42501', null, '익명은 jobs 테이블을 직접 못 읽는다');
select throws_ok($$ select count(*) from public.runs $$, '42501', null, '익명은 runs 테이블을 직접 못 읽는다');

-- 로그인
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.user_job', public.create_job('https://www.youtube.com/shorts/Smpl0Gochu1')::text, true);

reset role;
select is((select requested_by from public.jobs where id = current_setting('test.anon_job')::uuid), null,
          '익명 job은 requested_by가 없다');
select is((select requested_by from public.jobs where id = current_setting('test.user_job')::uuid),
          '11111111-1111-1111-1111-111111111111'::uuid, '로그인 job은 requested_by가 나다');

-- 내보내는 열: message·bundle·internal은 없다
select is((select proargnames from pg_catalog.pg_proc where oid = 'public.get_job(uuid)'::regprocedure),
          array['p_job_id', 'id', 'status', 'stage', 'error_code', 'reason', 'run_id', 'created_at', 'updated_at'],
          'get_job은 message를 돌려주지 않는다');
select is((select proargnames from pg_catalog.pg_proc where oid = 'public.get_run(uuid)'::regprocedure),
          array['p_run_id', 'id', 'source_url', 'recipe', 'partial', 'created_at'],
          'get_run은 bundle·internal 없이 partial을 돌려준다');

select * from finish();
rollback;
