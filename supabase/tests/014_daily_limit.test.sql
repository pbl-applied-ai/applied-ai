-- 하루 변환 한도: 로그인 10개, 로그인 전 전체 50개, 캐시로 끝난 job·어제 job은 세지 않는다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
-- 캐시로 다시 쓸 성공 run(어제 만든 것)
insert into public.runs (id, canonical_key, source_url, extractor_version, bundle, recipe, created_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'youtube:Smpl0Gochu1', 'https://www.youtube.com/shorts/Smpl0Gochu1',
        '{"pipeline": "0.1.0+abc1234"}', '{"segments": []}', '{"title": "x"}', now() - interval '1 day');

-- 사용자 A: 어제 job 5개(안 셈) + 오늘 캐시로 끝난 job 3개(안 셈) + 오늘 일반 job 8개
insert into public.jobs (source_url, requested_by, created_at)
select 'https://www.youtube.com/shorts/old', '11111111-1111-1111-1111-111111111111', now() - interval '2 days'
from generate_series(1, 5);
insert into public.jobs (source_url, requested_by, status, run_id)
select 'https://www.youtube.com/shorts/Smpl0Gochu1', '11111111-1111-1111-1111-111111111111',
       'succeeded', 'aaaaaaaa-0000-0000-0000-000000000001'
from generate_series(1, 3);
insert into public.jobs (source_url, requested_by)
select 'https://www.youtube.com/shorts/new', '11111111-1111-1111-1111-111111111111'
from generate_series(1, 8);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select is((select used from public.get_quota()), 8, '어제 job·캐시로 끝난 job은 오늘 개수에서 뺀다');
select is((select daily_limit from public.get_quota()), 10, '로그인 한도는 10');
select lives_ok($$ select public.create_job('https://www.youtube.com/shorts/n9') $$, '9번째는 된다');
select lives_ok($$ select public.create_job('https://www.youtube.com/shorts/n10') $$, '10번째도 된다');
select throws_ok($$ select public.create_job('https://www.youtube.com/shorts/n11') $$, 'PT429', 'daily limit: user',
                 '11번째는 막힌다');

-- 다른 사용자는 따로 센다
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select lives_ok($$ select public.create_job('https://www.youtube.com/shorts/b1') $$, '다른 사람은 따로 센다');

-- 로그인 전: 전체 49개가 이미 있으면 1개 더 되고 그다음은 막힌다
reset role;
insert into public.jobs (source_url) select 'https://www.youtube.com/shorts/anon' from generate_series(1, 49);
set local role anon;
select set_config('request.jwt.claims', '', true);
select lives_ok($$ select public.create_job('https://www.youtube.com/shorts/a50') $$, '로그인 전 50번째는 된다');
select throws_ok($$ select public.create_job('https://www.youtube.com/shorts/a51') $$, 'PT429', 'daily limit: anon',
                 '로그인 전 전체 51번째는 막힌다');
select throws_ok($$ select * from public.get_quota() $$, '42501', null, '로그인 전에는 get_quota를 못 부른다');

-- 팀 추천 변환(service_role)은 로그인 전 전체가 찼어도 막지 않는다
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select lives_ok($$ select public.create_job('https://www.youtube.com/shorts/team1') $$, 'service_role은 한도를 보지 않는다');

reset role;
select is((select count(*)::integer from public.jobs where requested_by = '11111111-1111-1111-1111-111111111111'
           and created_at >= now() - interval '1 hour'), 13, '막힌 요청은 job을 만들지 않는다(8+3+2)');

select * from finish();
rollback;
