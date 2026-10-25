-- 레시피북 MVP 테이블 초안 (KAN-21)
-- 기준: docs/worker-interface.md v0.2(#14), docs/mid-demo-plan.md v0.2
--
-- 접근 원칙
-- - 로그인 없이: 링크 넣기(create_job), 진행 확인(get_job), 결과 보기(get_run). 테이블 직접 조회는 막고 RPC로만 연다.
-- - 로그인 후: 내 레시피(user_recipes)만 읽고 쓴다(RLS).
-- - 워커: service_role 키로 접근한다(RLS 우회). runs·run_internals 쓰기는 워커만 한다.

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
  created_at timestamptz not null default now()
);

-- 캐시 조회: 같은 영상 + 같은 추출기 버전의 성공 결과가 있으면 재사용한다.
-- pipeline 버전이 +dev인 로컬 실행은 워커가 재사용하지 않는다(유니크로 막지 않음).
create index runs_cache_idx on public.runs (canonical_key, extractor_version);

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
  canonical_key text,                     -- 워커가 처리 전에 채운다. 해석 못 하면 null
  requested_by uuid references auth.users (id) on delete set null,  -- 로그인 안 했으면 null
  status public.job_status not null default 'queued',
  stage public.job_stage,
  error_code public.job_error_code,
  reason text,                            -- 내부 원인(집계·디버깅용)
  retry boolean,                          -- 워커 자동 재시도 대상 여부
  attempts integer not null default 0,
  next_run_at timestamptz not null default now(),
  run_id uuid references public.runs (id),
  message text,                           -- 원문 오류. 사용자에게 보여 주지 않는다(컬럼 권한으로 막음)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_succeeded_has_run check (status <> 'succeeded' or run_id is not null),
  constraint jobs_failed_has_error check (status <> 'failed' or error_code is not null)
);

create index jobs_queue_idx on public.jobs (next_run_at) where status = 'queued';
create index jobs_requested_by_idx on public.jobs (requested_by, created_at desc);

-- ── 사용자 레시피(레시피북) ─────────────────────────────

-- 저장할 때 run.recipe를 복사한 사본. 항목마다 id를 붙여 수정 전/후를 맞춘다.
-- ingredients: [{ id, name, amount_raw, amount_status, optional?, edited, user_entered }]
-- steps:       [{ id, order, text, edited, user_entered }]
-- 항목 ID 형식·user_entered 상태는 KAN-9(스키마 v0.2) 합의 전 임시안이다.
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

-- 로그인 사용자: 내가 넣은 작업 목록(레시피북의 "만드는 중" 카드). message·reason은 볼 수 없다.
grant select (id, source_url, status, stage, error_code, run_id, created_at, updated_at)
  on public.jobs to authenticated;
create policy jobs_select_own on public.jobs
  for select to authenticated using (requested_by = (select auth.uid()));

-- 로그인 사용자: 내 레시피만 읽고 쓴다.
grant select, insert, update, delete on public.user_recipes to authenticated;
create policy user_recipes_select_own on public.user_recipes
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_recipes_insert_own on public.user_recipes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_recipes_update_own on public.user_recipes
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
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
create function public.get_job(p_job_id uuid)
returns table (
  id uuid, status public.job_status, stage public.job_stage,
  error_code public.job_error_code, run_id uuid, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select j.id, j.status, j.stage, j.error_code, j.run_id, j.created_at, j.updated_at
  from public.jobs j
  where j.id = p_job_id;
$$;

-- 결과 보기(확인·수정 화면, 공개 링크 /r/<run_id>). bundle·internal은 주지 않는다.
create function public.get_run(p_run_id uuid)
returns table (id uuid, source_url text, recipe jsonb, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.source_url, r.recipe, r.created_at
  from public.runs r
  where r.id = p_run_id;
$$;

-- ── RPC: 워커 전용 ──────────────────────────────────────

-- 대기 중인 작업 하나를 가져간다. 여러 워커가 같은 작업을 잡지 않게 skip locked.
-- complete·fail은 워커가 service_role로 jobs·runs를 직접 갱신한다. [후속] pgTAP 검증(선규)
create function public.claim_next_job() returns setof public.jobs
language sql security definer set search_path = '' as $$
  update public.jobs
  set status = 'running', attempts = attempts + 1
  where id = (
    select id from public.jobs
    where status = 'queued' and next_run_at <= now()
    order by created_at
    for update skip locked
    limit 1
  )
  returning *;
$$;

-- Postgres는 함수 실행 권한을 기본으로 PUBLIC에 준다. 모두 거두고 필요한 것만 연다.
revoke execute on function
  public.create_job(text), public.get_job(uuid),
  public.get_run(uuid), public.claim_next_job()
  from public, anon, authenticated;

grant execute on function public.create_job(text), public.get_job(uuid), public.get_run(uuid)
  to anon, authenticated;
grant execute on function public.claim_next_job() to service_role;
