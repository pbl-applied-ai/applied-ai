-- 워커 claim과 lease(docs/worker-interface.md 2번): next_run_at 순서, 10분 lease,
-- 기한이 지난 running은 다시 잡고, 3번을 넘으면 worker_lost로 끝낸다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- j1·j2는 지금 잡을 수 있고(j2가 더 이르다), j3는 아직 때가 아니다.
insert into public.jobs (id, source_url, next_run_at, created_at) values
  ('dddddddd-0000-0000-0000-000000000001', 'https://www.youtube.com/shorts/A', now() - interval '1 minute', now() - interval '10 minutes'),
  ('dddddddd-0000-0000-0000-000000000002', 'https://www.youtube.com/shorts/B', now() - interval '5 minutes', now()),
  ('dddddddd-0000-0000-0000-000000000003', 'https://www.youtube.com/shorts/C', now() + interval '1 hour', now() - interval '1 hour');

set local role service_role;

select is((select id from public.claim_next_job()), 'dddddddd-0000-0000-0000-000000000002'::uuid,
          'next_run_at이 가장 이른 job부터 잡는다');
select results_eq(
  $$ select status, attempts, locked_until from public.jobs where id = 'dddddddd-0000-0000-0000-000000000002' $$,
  $$ values ('running'::public.job_status, 1, now() + interval '10 minutes') $$,
  'running·attempts 1·lease 10분');
select is((select id from public.claim_next_job()), 'dddddddd-0000-0000-0000-000000000001'::uuid,
          '두 번째 claim은 다른 job을 잡는다');
select is_empty($$ select * from public.claim_next_job() $$, '잡을 job이 없으면 빈 결과(미래 job·lease 중인 job 제외)');

-- 워커가 죽어 lease가 지난 job은 다시 잡는다
reset role;
update public.jobs set locked_until = now() - interval '1 second', stage = 'structure'
 where id = 'dddddddd-0000-0000-0000-000000000002';
set local role service_role;
select is((select id from public.claim_next_job()), 'dddddddd-0000-0000-0000-000000000002'::uuid,
          'lease가 지난 running job을 다시 잡는다');
select is((select attempts from public.jobs where id = 'dddddddd-0000-0000-0000-000000000002'), 2,
          '다시 잡으면 attempts가 오른다');
select is((select stage from public.jobs where id = 'dddddddd-0000-0000-0000-000000000002'), null,
          '다시 잡으면 지난 attempt의 stage를 지운다');
select throws_ok($$ select * from public.claim_next_job(null) $$, '22023', 'lease must be positive',
                 'lease가 없으면 거부(영원히 running 방지)');
select throws_ok($$ select * from public.claim_next_job(interval '-1 minute') $$, '22023', 'lease must be positive',
                 '음수 lease는 거부(같은 job 이중 claim 방지)');

-- 3번 다 쓴 job은 다시 잡지 않고 worker_lost로 끝낸다
reset role;
insert into public.jobs (id, source_url, status, stage, attempts, locked_until) values
  ('dddddddd-0000-0000-0000-000000000004', 'https://www.youtube.com/shorts/D', 'running', 'structure', 3,
   now() - interval '1 second');
set local role service_role;
select is_empty($$ select * from public.claim_next_job() $$, '3번 쓴 job은 다시 잡지 않는다');
select results_eq(
  $$ select status, error_code, reason, retry, locked_until, stage
       from public.jobs where id = 'dddddddd-0000-0000-0000-000000000004' $$,
  $$ values ('failed'::public.job_status, 'internal'::public.job_error_code, 'worker_lost', false,
             null::timestamptz, 'structure'::public.job_stage) $$,
  'failed·internal·worker_lost로 끝나고 stage는 남긴다');

-- lease를 바꿔 부를 수 있다(테스트·운영용)
reset role;
update public.jobs set next_run_at = now() - interval '1 second' where id = 'dddddddd-0000-0000-0000-000000000003';
set local role service_role;
select is((select locked_until from public.claim_next_job(interval '2 minutes')), now() + interval '2 minutes',
          'lease 길이를 인자로 받는다');

-- 성공·실패한 job은 다시 잡지 않는다
reset role;
insert into public.runs (id, canonical_key, source_url, extractor_version, bundle, recipe)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'youtube:E', 'https://www.youtube.com/shorts/E',
        '{"pipeline": "0.1.0+abc1234"}', '{}', '{}');
insert into public.jobs (id, source_url, status, run_id, error_code, next_run_at) values
  ('dddddddd-0000-0000-0000-000000000005', 'https://www.youtube.com/shorts/E', 'succeeded',
   'aaaaaaaa-0000-0000-0000-000000000001', null, now() - interval '1 hour'),
  ('dddddddd-0000-0000-0000-000000000006', 'https://www.youtube.com/shorts/F', 'failed', null, 'unavailable',
   now() - interval '1 hour');
set local role service_role;
select is_empty($$ select * from public.claim_next_job() $$, '끝난 job은 잡지 않는다');

-- 로그인 사용자·익명은 claim을 못 부른다
reset role;
set local role authenticated;
select throws_ok($$ select * from public.claim_next_job() $$, '42501', null, 'authenticated는 claim 불가');
reset role;
set local role anon;
select throws_ok($$ select * from public.claim_next_job() $$, '42501', null, 'anon은 claim 불가');
reset role;
select is((select count(*) from public.jobs where status = 'running'), 3::bigint, 'running job은 3개 남는다');

select * from finish();
rollback;
