-- 영상 파일 업로드는 로그인한 사람만 (#32 배포 조건, 11/9 선규·수빈 합의)
-- 업로드는 캐시를 쓰지 않아서 건마다 음성 인식·LLM 비용이 나간다. 로그인 없이 열면 비용을 막을 수 없다.
-- 로그인한 한 사람이 계속 올리는 것은 발표 규모에서는 두고, 하루 상한은 나중에 정한다.

-- 올리기 정책: authenticated만. 경로 규칙은 그대로다.
drop policy uploads_insert_incoming on storage.objects;
create policy uploads_insert_incoming on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and name ~ '^incoming/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|webm|m4v)$'
  );

-- job 만들기: 로그인 확인을 함수 안에서도 한다(실행 권한을 다시 열어도 막히게).
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
  -- 올린 사람 본인 파일로만 job을 만든다(Storage가 owner_id에 올린 사람을 적는다).
  if not exists (select 1 from storage.objects o
                 where o.bucket_id = 'uploads' and o.name = p_upload_path and o.owner_id = auth.uid()::text) then
    raise exception 'upload not found' using errcode = 'P0002';
  end if;

  insert into public.jobs (source_url, upload_path, requested_by)
  values ('upload:' || v_upload_id, p_upload_path, auth.uid())
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'upload already has a job' using errcode = '23505';
end;
$$;

revoke execute on function public.create_upload_job(text) from public, anon, authenticated;
grant execute on function public.create_upload_job(text) to authenticated;
