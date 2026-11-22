-- 하루 변환 한도 (docs/screen-data.md 3절 7번, 11/16 수빈 결정)
-- - 로그인한 사람: 한 사람당 하루 10개(링크·업로드 합계). create_job·create_upload_job이 막는다.
-- - 로그인 전: 사람을 구분할 수 없어 브라우저당 3개는 웹이 센다. RPC를 직접 부르면 그건 못 막으므로
--   로그인 전 job 전체 합계를 하루 50개로 서버가 막는다(1건 $0.03~0.04 기준 하루 $2 안쪽).
-- - 캐시로 끝난 job(이미 있던 성공 run을 다시 쓴 것)은 파이프라인 비용이 없어서 세지 않는다.
--   아직 처리 전인 job은 캐시로 끝날지 모르므로 센다.
-- - "하루"는 한국 시간 0시에 바뀐다(팀·데모 기준).
-- 넘으면 SQLSTATE PT429('daily limit: user' 또는 'daily limit: anon'). PostgREST가 HTTP 429로 돌려준다.

create index jobs_anon_created_idx on public.jobs (created_at) where requested_by is null;

-- 오늘(한국 시간) 이 사람(null이면 로그인 전 전체)이 만든 job 수. 캐시로 끝난 job은 뺀다.
create function public.jobs_today(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.jobs j
  where j.requested_by is not distinct from p_user
    and j.created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
    and not exists (
      select 1 from public.runs r
      where r.id = j.run_id and j.status = 'succeeded' and r.created_at < j.created_at
    );
$$;

-- 한도를 넘었으면 오류. 같은 사람(로그인 전은 전체)의 요청이 동시에 와도 하나씩 세도록 트랜잭션 잠금을 건다.
create function public.check_daily_limit() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  perform pg_advisory_xact_lock(hashtext('daily_limit:' || coalesce(v_user::text, 'anon')));
  if v_user is null then
    if public.jobs_today(null) >= 50 then
      raise exception 'daily limit: anon' using errcode = 'PT429';
    end if;
  elsif public.jobs_today(v_user) >= 10 then
    raise exception 'daily limit: user' using errcode = 'PT429';
  end if;
end;
$$;

create or replace function public.create_job(p_source_url text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_source_url is null or length(p_source_url) > 2048 or p_source_url !~* '^https?://' then
    raise exception 'invalid source_url' using errcode = '22023';
  end if;
  perform public.check_daily_limit();
  insert into public.jobs (source_url, requested_by)
  values (trim(p_source_url), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_upload_job(p_upload_path text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_upload_id text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  v_upload_id := substring(p_upload_path from
    '^incoming/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(mp4|mov|webm|m4v)$');
  if v_upload_id is null then
    raise exception 'invalid upload_path' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o
                 where o.bucket_id = 'uploads' and o.name = p_upload_path and o.owner_id = auth.uid()::text) then
    raise exception 'upload not found' using errcode = 'P0002';
  end if;
  perform public.check_daily_limit();

  insert into public.jobs (source_url, upload_path, requested_by)
  values ('upload:' || v_upload_id, p_upload_path, auth.uid())
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'upload already has a job' using errcode = '23505';
end;
$$;

-- 로그인한 사람의 오늘 개수와 한도(Convert 화면 "1 of 10 today"). 로그인 전은 웹이 브라우저에서 센다.
create function public.get_quota()
returns table (used integer, daily_limit integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query select public.jobs_today(auth.uid()), 10;
end;
$$;

revoke execute on function public.jobs_today(uuid), public.check_daily_limit(), public.get_quota()
  from public, anon, authenticated;
grant execute on function public.get_quota() to authenticated;
-- create or replace는 권한을 유지하지만 명시해 둔다
revoke execute on function public.create_job(text), public.create_upload_job(text) from public;
grant execute on function public.create_job(text) to anon, authenticated;
grant execute on function public.create_upload_job(text) to authenticated;
