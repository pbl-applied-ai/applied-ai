-- 영상 파일 업로드 경로 (KAN-49)
-- 기준: docs/worker-interface.md v0.4 3번 "업로드 입력"
--
-- 흐름
-- 1. 화면이 비공개 버킷 uploads에 incoming/<uuid>.<확장자>로 파일을 올린다(로그인 없이 가능, 올리기만 된다).
-- 2. create_upload_job(경로)로 job을 만든다. source_url은 'upload:<uuid>', 파일 위치는 jobs.upload_path.
-- 3. 워커가 service_role로 파일을 읽어 음성 인식 → 레시피를 만들고, job이 끝나면 파일을 지운다.
--
-- [후속] job을 만들지 않고 남은 파일(올리다 만 것) 정리, 익명 업로드 횟수 제한.

-- 워커가 읽을 파일 위치. 화면에는 열지 않는다(authenticated 열 권한 목록에 없음).
alter table public.jobs add column upload_path text;
create unique index jobs_upload_path_idx on public.jobs (upload_path) where upload_path is not null;

-- 비공개 버킷. 25MB는 음성 인식 API(OpenAI) 한도와 같다.
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false)
on conflict (id) do update set public = false;

-- 크기·형식 제한 열은 Storage 서비스가 만든다. DB만 띄우는 CI(supabase db start)에는 없을 수 있어 있을 때만 쓴다.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets
    set file_size_limit = 26214400,
        allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
    where id = 'uploads';
  end if;
end;
$$;

-- 로그인 없이 올리기만 된다. 읽기·덮어쓰기·지우기 정책은 없어서 다른 사람 파일을 볼 수 없다.
-- 경로는 화면이 만든 무작위 uuid라 남의 경로를 짐작할 수 없다.
create policy uploads_insert_incoming on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'uploads'
    and name ~ '^incoming/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|webm|m4v)$'
  );

-- 업로드한 파일로 job을 만든다. 파일이 실제로 올라가 있어야 하고, 한 파일로 job은 하나만 만든다.
create function public.create_upload_job(p_upload_path text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_upload_id text;
  v_id uuid;
begin
  v_upload_id := substring(p_upload_path from
    '^incoming/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(mp4|mov|webm|m4v)$');
  if v_upload_id is null then
    raise exception 'invalid upload_path' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'uploads' and o.name = p_upload_path) then
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
grant execute on function public.create_upload_job(text) to anon, authenticated;
