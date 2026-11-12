-- AI 추정 분량(KAN-52): 로그인 전 공개 링크(get_run)에서는 빠지고, 로그인하면 보인다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.com');
insert into public.runs (id, canonical_key, source_url, extractor_version, bundle, recipe) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'youtube:Smpl0Gochu1', 'https://www.youtube.com/shorts/Smpl0Gochu1',
   '{"pipeline": "0.1.0+abc1234"}', '{}',
   '{"title": "덮밥", "ingredients": [
      {"id": "ing-1", "name": "고추장", "amount_raw": "2큰술", "amount_status": "confirmed"},
      {"id": "ing-2", "name": "설탕", "amount_raw": null, "amount_status": "unconfirmed",
       "amount_estimate": {"text": "1큰술", "basis": "2인분 기준"}}],
     "steps": []}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'youtube:Smpl0Kimch2', 'https://www.youtube.com/shorts/Smpl0Kimch2',
   '{"pipeline": "0.1.0+abc1234"}', '{}', '{}');

set local role anon;
select set_config('request.jwt.claims', '', true);
select is((select recipe -> 'ingredients' -> 1 -> 'amount_estimate' from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
          null, '로그인 전에는 추정값이 빠진다');
select is((select recipe -> 'ingredients' -> 1 ->> 'name' from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
          '설탕', '추정값만 빠지고 재료는 그대로다');
select is((select recipe -> 'ingredients' -> 0 ->> 'amount_raw' from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
          '2큰술', '영상 분량은 그대로다');
select is((select recipe from public.get_run('aaaaaaaa-0000-0000-0000-000000000002')), '{}'::jsonb,
          '재료 칸이 없는 결과는 모양을 바꾸지 않는다');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select is((select recipe -> 'ingredients' -> 1 -> 'amount_estimate' ->> 'text' from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
          '1큰술', '로그인하면 확인·수정 화면이 추정값을 받는다');

select * from finish();
rollback;
