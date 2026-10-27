-- 레시피북 MVP 테이블 (KAN-21)
-- 기준: docs/worker-interface.md v0.3(#14), docs/mid-demo-plan.md v0.2
--
-- 접근 원칙
-- - 로그인 없이: 링크 넣기(create_job), 진행 확인(get_job), 결과 보기(get_run). 테이블 직접 조회는 막고 RPC로만 연다.
-- - 로그인 후: 내 작업 목록과 내 레시피(user_recipes)만 읽고 지운다(RLS). 저장·수정은 KAN-22 RPC로만 연다.
-- - 워커: service_role로 claim·stage·complete·fail RPC를 부른다. runs·run_internals 쓰기는 워커만 한다.
-- 검증: supabase/tests/*.test.sql (pgTAP)

-- ── 상태값 ─────────────────────────────────────────────

create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed');

-- 실제로 시작한 단계만 기록한다. 화면에는 finalize를 표시하지 않는다.
create type public.job_stage as enum ('collect', 'asr', 'ocr', 'structure', 'finalize');

-- 화면 안내 종류. worker-interface.md 6번 표와 1:1.
create type public.job_error_code as enum (
  'retryable', 'unavailable', 'unsupported_source', 'not_a_recipe', 'insufficient', 'internal'
);

-- ── 추출 결과(run): 고치지 않는다 ─────────────────────────

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,            -- 예: youtube:<영상 ID>
  source_url text not null,
  extractor_version jsonb not null,       -- { pipeline, collector, prompt, model }
  bundle jsonb not null,                  -- schemas/evidence_bundle.schema.json
  recipe jsonb not null,                  -- schemas/recipe.schema.json (RecipeDraft)
  metrics jsonb,                          -- 단계별 처리 시간·토큰 사용량
  partial boolean not null default false, -- 재료나 단계 한쪽만 있는 결과(partial_recipe). recipe가 minItems를 못 지킨다
  created_at timestamptz not null default now()
);

-- 캐시 조회: 같은 영상 + 같은 추출기 버전의 성공 결과만 재사용한다(find_cached_run).
create index runs_cache_idx on public.runs (canonical_key, extractor_version) where not partial;

-- 파이프라인 내부 결과(분량 내부 상태·항목 ID·근거 시각 등). 평가·디버깅 전용, 서버에서만 읽는다.
create table public.run_internals (
  run_id uuid primary key references public.runs (id) on delete cascade,
  internal jsonb not null,
  created_at timestamptz not null default now()
);

-- ── 작업(job) ───────────────────────────────────────────

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  canonical_key text,                     -- 워커가 채운다. 해석 못 하면 null
  requested_by uuid references auth.users (id) on delete set null,  -- 로그인 안 했으면 null
  status public.job_status not null default 'queued',
  stage public.job_stage,
  error_code public.job_error_code,
  reason text,                            -- 세부 원인(예: partial_recipe). 화면이 실패 안내를 고를 때 먼저 본다
  retry boolean,                          -- 워커 자동 재시도 대상 여부
  attempts integer not null default 0,    -- claim할 때마다 1 오른다. complete·fail은 이 값이 같을 때만 갱신한다
  next_run_at timestamptz not null default now(),
  locked_until timestamptz,               -- running lease. 지나면 다른 워커가 다시 잡는다
  run_id uuid references public.runs (id),
  message text,                           -- 원문 오류. 사용자에게 보여 주지 않는다(컬럼 권한으로 막음)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_succeeded_has_run check (status <> 'succeeded' or run_id is not null),
  constraint jobs_failed_has_error check (status <> 'failed' or error_code is not null),
  -- 실패 job이 run을 가리키는 건 찾은 만큼 보기(partial run)뿐이다
  constraint jobs_failed_run_only_partial check (status <> 'failed' or run_id is null or reason = 'partial_recipe')
);

create index jobs_queue_idx on public.jobs (next_run_at) where status = 'queued';
create index jobs_lease_idx on public.jobs (locked_until) where status = 'running';
create index jobs_requested_by_idx on public.jobs (requested_by, created_at desc);

-- ── 사용자 레시피(레시피북) ─────────────────────────────

-- 저장할 때 run.recipe를 복사한 사본. 항목마다 id를 붙여 수정 전/후를 맞춘다.
-- ingredients: [{ id, name, amount_raw, amount_status, optional?, edited, user_entered }]
-- steps:       [{ id, text, edited, user_entered }]  (배열 순서가 조리 순서)
-- 항목 ID 형식·user_entered 상태는 KAN-9(스키마 v0.2) 합의 전 임시안이다.
-- 저장·수정은 KAN-22에서 RPC로 연다. 클라이언트가 amount_status를 마음대로 쓰지 못하게 서버가 run.recipe와 비교한다.
create table public.user_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  run_id uuid not null references public.runs (id),
  title text not null check (length(title) between 1 and 200),
  servings_raw text,
  ingredients jsonb not null check (jsonb_typeof(ingredients) = 'array'),
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, run_id)                -- 같은 영상을 두 번 저장하면 기존 레시피를 고친다
);

create index user_recipes_list_idx on public.user_recipes (user_id, created_at desc);

-- ── updated_at 자동 갱신 ─────────────────────────────────

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();
create trigger user_recipes_touch before update on public.user_recipes
  for each row execute function public.touch_updated_at();

-- ── 권한: 기본으로 모두 막고 필요한 것만 연다 ─────────────

alter table public.runs enable row level security;
alter table public.run_internals enable row level security;
alter table public.jobs enable row level security;
alter table public.user_recipes enable row level security;

revoke all on public.runs, public.run_internals, public.jobs, public.user_recipes from anon, authenticated;

-- 로그인 사용자: 내가 넣은 작업 목록(레시피북의 "만드는 중" 카드). message는 볼 수 없다.
grant select (id, source_url, status, stage, error_code, reason, run_id, created_at, updated_at)
  on public.jobs to authenticated;
create policy jobs_select_own on public.jobs
  for select to authenticated using (requested_by = (select auth.uid()));

-- 로그인 사용자: 내 레시피만 읽고 지운다.
grant select, delete on public.user_recipes to authenticated;
create policy user_recipes_select_own on public.user_recipes
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_recipes_delete_own on public.user_recipes
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── RPC: 로그인 없이 쓰는 3개 ────────────────────────────

-- 링크 넣기. 링크 해석·지원 여부 판단은 워커가 한다(unsupported_source).
-- [후속] 익명 요청 횟수 제한(LLM 비용). 데모 전에는 배포 URL을 공개하지 않는 것으로 대신한다.
create function public.create_job(p_source_url text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_source_url is null or length(p_source_url) > 2048 or p_source_url !~* '^https?://' then
    raise exception 'invalid source_url' using errcode = '22023';
  end if;
  insert into public.jobs (source_url, requested_by)
  values (trim(p_source_url), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- 진행 확인(처리 중 화면이 폴링). id를 아는 사람만 볼 수 있다.
-- reason은 실패 안내를 고르는 데 쓴다. partial_recipe 실패면 run_id로 찾은 만큼 보기.
create function public.get_job(p_job_id uuid)
returns table (
  id uuid, status public.job_status, stage public.job_stage,
  error_code public.job_error_code, reason text, run_id uuid, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select j.id, j.status, j.stage, j.error_code, j.reason, j.run_id, j.created_at, j.updated_at
  from public.jobs j
  where j.id = p_job_id;
$$;

-- 결과 보기(확인·수정 화면, 공개 링크 /r/<run_id>). bundle·internal은 주지 않는다.
create function public.get_run(p_run_id uuid)
returns table (id uuid, source_url text, recipe jsonb, partial boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.source_url, r.recipe, r.partial, r.created_at
  from public.runs r
  where r.id = p_run_id;
$$;

-- ── RPC: 워커 전용 (worker-interface.md 2번) ─────────────
-- stage·complete·fail은 자기가 잡은 job(status = running, attempts = claim 때 값)만 갱신한다.
-- lease가 끝나 다른 워커가 다시 잡은 job을 늦게 끝난 워커가 덮어쓰지 않게 하기 위해서다.

-- 작업 하나를 가져간다. 기한이 지난 running도 다시 잡고, 3번을 다 쓴 job은 worker_lost로 끝낸다.
create function public.claim_next_job(p_lease interval default interval '10 minutes')
returns setof public.jobs
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs
  set status = 'failed', error_code = 'internal', reason = 'worker_lost', retry = false, locked_until = null
  where status = 'running' and locked_until < now() and attempts >= 3;

  return query
  update public.jobs
  set status = 'running', attempts = attempts + 1, locked_until = now() + p_lease
  where id = (
    select j.id from public.jobs j
    where (j.status = 'queued' and j.next_run_at <= now())
       or (j.status = 'running' and j.locked_until < now() and j.attempts < 3)
    order by j.next_run_at
    for update skip locked
    limit 1
  )
  returning *;
end;
$$;

-- 실제로 시작한 단계를 기록한다(처리 중 화면 문구).
create function public.set_job_stage(p_job_id uuid, p_attempt integer, p_stage public.job_stage)
returns boolean
language sql security definer set search_path = '' as $$
  with u as (
    update public.jobs set stage = p_stage
    where id = p_job_id and status = 'running' and attempts = p_attempt
    returning 1
  )
  select exists (select 1 from u);
$$;

-- 같은 영상·같은 추출기 버전의 가장 최근 성공 run. partial run과 로컬 실행(+dev)은 재사용하지 않는다.
create function public.find_cached_run(p_canonical_key text, p_extractor_version jsonb)
returns uuid
language sql stable security definer set search_path = '' as $$
  select r.id from public.runs r
  where r.canonical_key = p_canonical_key
    and r.extractor_version = p_extractor_version
    and not r.partial
    and coalesce(r.extractor_version ->> 'pipeline', '') not like '%+dev'
  order by r.created_at desc
  limit 1;
$$;

-- 성공: run·internal을 저장하고 job을 끝낸다. 내 attempt가 아니면 아무것도 안 하고 null.
create function public.complete_job(
  p_job_id uuid, p_attempt integer, p_canonical_key text, p_extractor_version jsonb,
  p_bundle jsonb, p_recipe jsonb, p_metrics jsonb, p_internal jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_source_url text;
  v_run_id uuid;
begin
  select j.source_url into v_source_url from public.jobs j
  where j.id = p_job_id and j.status = 'running' and j.attempts = p_attempt
  for update;
  if not found then
    return null;
  end if;

  insert into public.runs (canonical_key, source_url, extractor_version, bundle, recipe, metrics)
  values (p_canonical_key, v_source_url, p_extractor_version, p_bundle, p_recipe, p_metrics)
  returning id into v_run_id;
  insert into public.run_internals (run_id, internal) values (v_run_id, p_internal);

  update public.jobs
  set status = 'succeeded', run_id = v_run_id, canonical_key = p_canonical_key, locked_until = null
  where id = p_job_id;
  return v_run_id;
end;
$$;

-- 성공(캐시): 이미 있는 성공 run으로 job을 끝낸다. 내 attempt가 아니면 false.
create function public.complete_job_from_cache(p_job_id uuid, p_attempt integer, p_run_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_canonical_key text;
begin
  select r.canonical_key into v_canonical_key from public.runs r where r.id = p_run_id and not r.partial;
  if not found then
    raise exception 'not a reusable run' using errcode = '22023';
  end if;

  update public.jobs
  set status = 'succeeded', run_id = p_run_id, canonical_key = v_canonical_key, locked_until = null
  where id = p_job_id and status = 'running' and attempts = p_attempt;
  return found;
end;
$$;

-- 실패: retry이고 3번을 다 쓰지 않았으면 30초·2분 뒤 다시(6번 표 "자동 재시도"), 아니면 failed.
-- partial_recipe면 p_partial({ bundle, recipe, metrics, internal })을 partial run으로 저장하고 run_id로 가리킨다.
-- 내 attempt가 아니면 아무것도 안 하고 null.
create function public.fail_job(
  p_job_id uuid, p_attempt integer, p_stage public.job_stage, p_error_code public.job_error_code,
  p_reason text, p_retry boolean, p_message text,
  p_canonical_key text default null, p_extractor_version jsonb default null, p_partial jsonb default null
) returns public.job_status
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
  v_run_id uuid;
begin
  if p_partial is not null and p_reason is distinct from 'partial_recipe' then
    raise exception 'partial is only for partial_recipe' using errcode = '22023';
  end if;
  if p_partial is not null and (p_canonical_key is null or p_extractor_version is null) then
    raise exception 'partial needs canonical_key and extractor_version' using errcode = '22023';
  end if;

  select * into v_job from public.jobs j
  where j.id = p_job_id and j.status = 'running' and j.attempts = p_attempt
  for update;
  if not found then
    return null;
  end if;

  if p_retry and v_job.attempts < 3 then
    update public.jobs
    set status = 'queued', stage = p_stage, canonical_key = coalesce(p_canonical_key, canonical_key),
        retry = true, message = p_message, locked_until = null,
        next_run_at = now() + case when v_job.attempts = 1 then interval '30 seconds' else interval '2 minutes' end
    where id = p_job_id;
    return 'queued';
  end if;

  if p_partial is not null then
    insert into public.runs (canonical_key, source_url, extractor_version, bundle, recipe, metrics, partial)
    values (p_canonical_key, v_job.source_url, p_extractor_version,
            p_partial -> 'bundle', p_partial -> 'recipe', p_partial -> 'metrics', true)
    returning id into v_run_id;
    insert into public.run_internals (run_id, internal) values (v_run_id, p_partial -> 'internal');
  end if;

  update public.jobs
  set status = 'failed', stage = p_stage, error_code = p_error_code, reason = p_reason, retry = p_retry,
      message = p_message, canonical_key = coalesce(p_canonical_key, canonical_key),
      run_id = v_run_id, locked_until = null
  where id = p_job_id;
  return 'failed';
end;
$$;

-- Postgres는 함수 실행 권한을 기본으로 PUBLIC에 주고, Supabase는 public 스키마 함수에 anon·authenticated
-- 실행 권한을 기본으로 준다. 모두 거두고 필요한 것만 연다(supabase/tests/001에서 목록을 고정).
revoke execute on function
  public.touch_updated_at(),
  public.create_job(text), public.get_job(uuid), public.get_run(uuid),
  public.claim_next_job(interval), public.set_job_stage(uuid, integer, public.job_stage),
  public.find_cached_run(text, jsonb),
  public.complete_job(uuid, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb),
  public.complete_job_from_cache(uuid, integer, uuid),
  public.fail_job(uuid, integer, public.job_stage, public.job_error_code, text, boolean, text, text, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function public.create_job(text), public.get_job(uuid), public.get_run(uuid)
  to anon, authenticated;
grant execute on function
  public.claim_next_job(interval), public.set_job_stage(uuid, integer, public.job_stage),
  public.find_cached_run(text, jsonb),
  public.complete_job(uuid, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb),
  public.complete_job_from_cache(uuid, integer, uuid),
  public.fail_job(uuid, integer, public.job_stage, public.job_error_code, text, boolean, text, text, jsonb, jsonb)
  to service_role;
