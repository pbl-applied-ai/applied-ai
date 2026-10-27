-- 워커 complete·fail(docs/worker-interface.md 2·4·6번).
-- 자기가 잡은 attempt일 때만 갱신, 자동 재시도는 30초·2분 뒤 최대 3번, partial run 저장.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create function pg_temp.running_job(id uuid, attempts int) returns void language sql as $$
  insert into public.jobs (id, source_url, status, attempts, locked_until)
  values (id, 'https://www.youtube.com/shorts/Smpl0Gochu1', 'running', attempts, now() + interval '10 minutes') $$;

select pg_temp.running_job('eeeeeeee-0000-0000-0000-000000000001', 1);
select pg_temp.running_job('eeeeeeee-0000-0000-0000-000000000002', 1);
select pg_temp.running_job('eeeeeeee-0000-0000-0000-000000000003', 2);
select pg_temp.running_job('eeeeeeee-0000-0000-0000-000000000004', 3);
select pg_temp.running_job('eeeeeeee-0000-0000-0000-000000000005', 1);
select pg_temp.running_job('eeeeeeee-0000-0000-0000-000000000006', 1);
select pg_temp.running_job('eeeeeeee-0000-0000-0000-000000000007', 1);
select pg_temp.running_job('eeeeeeee-0000-0000-0000-000000000008', 1);
select pg_temp.running_job('eeeeeeee-0000-0000-0000-000000000009', 1);

set local role service_role;

-- stage
select is(public.set_job_stage('eeeeeeee-0000-0000-0000-000000000001', 1, 'structure'), true, '자기 attempt면 stage를 쓴다');
select is(public.set_job_stage('eeeeeeee-0000-0000-0000-000000000001', 2, 'finalize'), false, '다른 attempt면 stage를 안 쓴다');
select is((select stage from public.jobs where id = 'eeeeeeee-0000-0000-0000-000000000001'),
          'structure'::public.job_stage, 'stage는 structure 그대로');

-- complete
select is(public.complete_job('eeeeeeee-0000-0000-0000-000000000001', 2, 'youtube:Smpl0Gochu1',
                              '{"pipeline": "0.1.0+abc1234"}', '{}', '{}', '{}', '{}'),
          null, '다른 attempt의 complete는 무시한다');
select is((select status from public.jobs where id = 'eeeeeeee-0000-0000-0000-000000000001'),
          'running'::public.job_status, '무시하면 running 그대로');

select set_config('test.run1', public.complete_job(
  'eeeeeeee-0000-0000-0000-000000000001', 1, 'youtube:Smpl0Gochu1', '{"pipeline": "0.1.0+abc1234"}',
  '{"segments": []}', '{"title": "고추장 목살덮밥"}', '{"latency_ms": 10}', '{"internal": true}')::text, true);
select results_eq(
  $$ select status, run_id, canonical_key, locked_until, stage
       from public.jobs where id = 'eeeeeeee-0000-0000-0000-000000000001' $$,
  $$ values ('succeeded'::public.job_status, current_setting('test.run1')::uuid, 'youtube:Smpl0Gochu1',
             null::timestamptz, 'structure'::public.job_stage) $$,
  'complete하면 succeeded·run_id·canonical_key, lease 해제');
select results_eq(
  $$ select r.source_url, r.partial, r.recipe, i.internal
       from public.runs r join public.run_internals i on i.run_id = r.id
      where r.id = current_setting('test.run1')::uuid $$,
  $$ values ('https://www.youtube.com/shorts/Smpl0Gochu1', false, '{"title": "고추장 목살덮밥"}'::jsonb,
             '{"internal": true}'::jsonb) $$,
  'run·run_internals가 저장된다');
select is(public.complete_job('eeeeeeee-0000-0000-0000-000000000001', 1, 'youtube:Smpl0Gochu1',
                              '{"pipeline": "0.1.0+abc1234"}', '{}', '{}', '{}', '{}'),
          null, '이미 끝난 job은 다시 complete하지 않는다');

-- 자동 재시도: 지난 attempt의 화면용 오류가 남아 있어도 queued로 돌아갈 때 비운다
reset role;
update public.jobs set error_code = 'internal', reason = 'unexpected' where id = 'eeeeeeee-0000-0000-0000-000000000002';
set local role service_role;
select is(public.fail_job('eeeeeeee-0000-0000-0000-000000000002', 1, 'collect', 'retryable', 'collect_network',
                          true, '원문 오류'),
          'queued'::public.job_status, '1번째 재시도 대상은 queued로 돌아간다');
select results_eq(
  $$ select next_run_at, locked_until, error_code, message
       from public.jobs where id = 'eeeeeeee-0000-0000-0000-000000000002' $$,
  $$ values (now() + interval '30 seconds', null::timestamptz, null::public.job_error_code, '원문 오류') $$,
  '30초 뒤 다시, lease 해제, 화면용 오류는 비움');
select is((select reason from public.jobs where id = 'eeeeeeee-0000-0000-0000-000000000002'), null, 'reason도 비움');
select is(public.set_job_stage('eeeeeeee-0000-0000-0000-000000000002', 1, 'structure'), false,
          'queued로 돌아간 뒤 늦게 온 워커는 stage를 못 쓴다');
select is(public.fail_job('eeeeeeee-0000-0000-0000-000000000003', 2, 'structure', 'retryable', 'llm_transient',
                          true, null),
          'queued'::public.job_status, '2번째도 queued');
select is((select next_run_at from public.jobs where id = 'eeeeeeee-0000-0000-0000-000000000003'),
          now() + interval '2 minutes', '2번째는 2분 뒤');
select is(public.fail_job('eeeeeeee-0000-0000-0000-000000000004', 3, 'structure', 'retryable', 'llm_transient',
                          true, null),
          'failed'::public.job_status, '3번 다 쓰면 failed');
select results_eq(
  $$ select error_code, reason, retry, locked_until from public.jobs where id = 'eeeeeeee-0000-0000-0000-000000000004' $$,
  $$ values ('retryable'::public.job_error_code, 'llm_transient', true, null::timestamptz) $$,
  'failed에 error_code·reason이 남는다');

-- 재시도 안 하는 실패
select is(public.fail_job('eeeeeeee-0000-0000-0000-000000000005', 1, 'collect', 'unavailable', 'not_playable',
                          false, '원문 오류', 'youtube:Smpl0Gochu1'),
          'failed'::public.job_status, 'retry가 아니면 바로 failed');
select results_eq(
  $$ select error_code, reason, canonical_key, run_id, stage from public.jobs where id = 'eeeeeeee-0000-0000-0000-000000000005' $$,
  $$ values ('unavailable'::public.job_error_code, 'not_playable', 'youtube:Smpl0Gochu1', null::uuid,
             'collect'::public.job_stage) $$,
  'failed에 error_code·reason·canonical_key·stage가 남는다');
select is(public.fail_job('eeeeeeee-0000-0000-0000-000000000005', 1, 'collect', 'unavailable', 'not_playable',
                          false, null),
          null, '이미 끝난 job은 다시 fail하지 않는다');

-- partial run
select is(public.fail_job('eeeeeeee-0000-0000-0000-000000000006', 1, 'finalize', 'insufficient', 'partial_recipe',
                          false, null, 'youtube:Smpl0Gochu1', '{"pipeline": "0.1.0+abc1234"}',
                          '{"bundle": {}, "recipe": {"steps": []}, "metrics": {}, "internal": {"x": 1}}'),
          'failed'::public.job_status, 'partial_recipe는 failed');
select results_eq(
  $$ select r.partial, r.recipe, i.internal
       from public.jobs j join public.runs r on r.id = j.run_id join public.run_internals i on i.run_id = r.id
      where j.id = 'eeeeeeee-0000-0000-0000-000000000006' $$,
  $$ values (true, '{"steps": []}'::jsonb, '{"x": 1}'::jsonb) $$,
  'partial run을 저장하고 실패 job의 run_id로 가리킨다');
select throws_ok(
  $$ select public.fail_job('eeeeeeee-0000-0000-0000-000000000007', 1, 'finalize', 'insufficient', 'empty_recipe',
                            false, null, null, '{"pipeline": "0.1.0+abc1234"}',
                            '{"bundle": {}, "recipe": {}, "metrics": {}, "internal": {}}') $$,
  '22023', 'partial is only for partial_recipe', 'partial_recipe가 아니면 partial을 받지 않는다');

select throws_ok(
  $$ select public.fail_job('eeeeeeee-0000-0000-0000-000000000007', 1, 'finalize', 'insufficient', 'partial_recipe',
                            false, null, null, null, '{"bundle": {}, "recipe": {}, "metrics": {}, "internal": {}}') $$,
  '22023', 'partial needs canonical_key and extractor_version', 'partial run은 canonical_key·버전이 있어야 저장한다');

-- 캐시 재사용
select throws_ok(
  format('select public.complete_job_from_cache(%L, 1, %L)', 'eeeeeeee-0000-0000-0000-000000000008',
         (select run_id from public.jobs where id = 'eeeeeeee-0000-0000-0000-000000000006')),
  '22023', 'not a reusable run', 'partial run은 캐시로 쓰지 않는다');
reset role;
insert into public.runs (id, canonical_key, source_url, extractor_version, bundle, recipe)
values ('aaaaaaaa-0000-0000-0000-0000000000de', 'youtube:Smpl0Gochu1', 'https://www.youtube.com/shorts/Smpl0Gochu1',
        '{"pipeline": "0.1.0+dev"}', '{}', '{}');
set local role service_role;
select throws_ok(
  $$ select public.complete_job_from_cache('eeeeeeee-0000-0000-0000-000000000008', 1,
                                           'aaaaaaaa-0000-0000-0000-0000000000de') $$,
  '22023', 'not a reusable run', '로컬 실행(+dev) run은 캐시로 쓰지 않는다');
select is(public.complete_job_from_cache('eeeeeeee-0000-0000-0000-000000000008', 1, current_setting('test.run1')::uuid),
          true, '성공 run으로 바로 complete');
select is(public.complete_job_from_cache('eeeeeeee-0000-0000-0000-000000000009', 2, current_setting('test.run1')::uuid),
          false, '다른 attempt면 캐시 complete도 무시');

-- 제약
reset role;
select throws_ok(
  $$ update public.jobs set status = 'failed', error_code = 'internal', reason = 'unexpected',
            run_id = current_setting('test.run1')::uuid
      where id = 'eeeeeeee-0000-0000-0000-000000000009' $$,
  '23514', null, 'partial_recipe가 아닌 실패 job은 run_id를 가질 수 없다');
select throws_ok(
  $$ update public.jobs set status = 'succeeded', run_id = (select run_id from public.jobs
                                                           where id = 'eeeeeeee-0000-0000-0000-000000000006')
      where id = 'eeeeeeee-0000-0000-0000-000000000009' $$,
  '23514', null, '성공 job은 partial run을 가리킬 수 없다');
select throws_ok(
  $$ update public.jobs set status = 'failed', error_code = 'insufficient', reason = 'partial_recipe',
            run_id = current_setting('test.run1')::uuid
      where id = 'eeeeeeee-0000-0000-0000-000000000009' $$,
  '23514', null, '실패 job은 partial run만 가리킨다');
select throws_ok(
  $$ update public.jobs set locked_until = null where id = 'eeeeeeee-0000-0000-0000-000000000009' $$,
  '23514', null, 'running job은 lease 없이 둘 수 없다');

select * from finish();
rollback;
