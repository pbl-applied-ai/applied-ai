-- 영상 파일 업로드(KAN-49): 버킷 정책, create_upload_job 입력 검사, 워커가 받는 열.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select is((select public from storage.buckets where id = 'uploads'), false, 'uploads 버킷은 비공개다');

-- 화면이 올린 파일 대신 행을 직접 넣는다(Storage 서비스 없이 DB만 검사)
insert into storage.objects (bucket_id, name)
values ('uploads', 'incoming/0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e.mp4');

-- 익명
set local role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok($$ select public.create_upload_job('incoming/../secret.mp4') $$, '22023', 'invalid upload_path',
                 '정해진 형식이 아닌 경로는 거부');
select throws_ok($$ select public.create_upload_job('incoming/0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e.exe') $$, '22023',
                 'invalid upload_path', '영상이 아닌 확장자는 거부');
select throws_ok($$ select public.create_upload_job(null) $$, '22023', 'invalid upload_path', 'null은 거부');
select throws_ok($$ select public.create_upload_job('incoming/11111111-2222-4333-8444-555555555555.mp4') $$, 'P0002',
                 'upload not found', '올라가지 않은 파일로는 job을 못 만든다');

select set_config('test.upload_job',
  public.create_upload_job('incoming/0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e.mp4')::text, true);
select is((select status from public.get_job(current_setting('test.upload_job')::uuid)), 'queued'::public.job_status,
          '익명도 업로드 job을 만들고 진행 상태를 본다');
select throws_ok($$ select public.create_upload_job('incoming/0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e.mp4') $$, '23505',
                 'upload already has a job', '한 파일로 job은 하나만 만든다');

reset role;
select is((select source_url from public.jobs where id = current_setting('test.upload_job')::uuid),
          'upload:0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e', 'source_url은 upload:<uuid>');

-- 워커가 claim하면 upload_path를 받는다
select is((select upload_path from public.claim_next_job()),
          'incoming/0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e.mp4', '워커는 claim한 job의 upload_path를 받는다');

select is_empty(
  $$ select policyname from pg_catalog.pg_policies
      where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'UPDATE', 'DELETE', 'ALL')
        and (coalesce(qual, '') || coalesce(with_check, '')) like '%uploads%' $$,
  'uploads 버킷 파일은 읽기·덮어쓰기·지우기 정책이 없다(워커만 service_role로)'
);

select ok(not has_column_privilege('authenticated', 'public.jobs', 'upload_path', 'select'),
          '로그인 사용자도 upload_path는 못 읽는다');

select * from finish();
rollback;
