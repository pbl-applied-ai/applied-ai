-- 테이블 RLS, 역할별 권한, 로그인 없이 부를 수 있는 함수 목록을 고정한다.
-- RPC를 더하거나 권한을 바꾸면 이 파일의 기대값도 같은 PR에서 고친다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is_empty(
  $$ select c.relname from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'public의 모든 테이블에 RLS가 켜져 있다'
);

-- 테이블 단위 권한
select is_empty(
  $$ select c.relname || ':' || p
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
        and has_table_privilege('anon', c.oid, p) $$,
  'anon은 public 테이블 권한이 없다'
);

select set_eq(
  $$ select c.relname || ':' || p
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
        and has_table_privilege('authenticated', c.oid, p) $$,
  $$ values ('user_recipes:SELECT'), ('user_recipes:DELETE') $$,
  'authenticated는 user_recipes 읽기·삭제만 할 수 있다(저장은 KAN-22 RPC)'
);

-- jobs는 열 단위로 연다. message·requested_by 등은 보이지 않는다.
select set_eq(
  $$ select a.attname::text || ':' || p
       from pg_catalog.pg_attribute a
      cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p
      where a.attrelid = 'public.jobs'::regclass and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', a.attrelid, a.attnum, p) $$,
  $$ select c || ':SELECT' from unnest(array[
       'id', 'source_url', 'status', 'stage', 'error_code', 'reason', 'run_id', 'created_at', 'updated_at'
     ]) c $$,
  'authenticated는 jobs의 화면용 열만 읽는다'
);

-- 실행 권한: 로그인 없이·로그인해서 부를 수 있는 함수는 이 3개뿐이다.
select set_eq(
  $$ select p.proname::text from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') $$,
  array['create_job', 'get_job', 'get_run'],
  'anon이 실행할 수 있는 public 함수 목록'
);

select set_eq(
  $$ select p.proname::text from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') $$,
  array['create_job', 'get_job', 'get_run'],
  'authenticated가 실행할 수 있는 public 함수 목록'
);

select is_empty(
  $$ select f from unnest(array[
       'claim_next_job', 'set_job_stage', 'find_cached_run', 'complete_job', 'complete_job_from_cache', 'fail_job'
     ]) f
     where not exists (
       select 1 from pg_catalog.pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = f
          and has_function_privilege('service_role', p.oid, 'execute')
     ) $$,
  '워커 RPC는 모두 service_role이 실행할 수 있다'
);

select is_empty(
  $$ select p.proname from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and not coalesce(p.proconfig @> array['search_path=""'], false) $$,
  'security definer 함수는 모두 search_path를 비워 둔다'
);

select * from finish();
rollback;
