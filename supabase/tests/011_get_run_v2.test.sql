-- 레시피 상세 get_run 확장(KAN-73, docs/screen-data.md 7절 2번): 카드 정보, 저장 수, 내가 저장했는지,
-- 재료마다 분량이 나온 근거 종류(amount_source). 로그인 전 추정값 빼기(#45, 009)는 그대로다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function pg_temp.login_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

insert into public.runs (id, canonical_key, source_url, extractor_version, bundle, recipe) values (
  'aaaaaaaa-0000-0000-0000-000000000001', 'youtube:Smpl0Gochu1', 'https://www.youtube.com/shorts/Smpl0Gochu1',
  '{"pipeline": "0.1.0+abc1234"}',
  '{"source": {"kind": "youtube", "channel": "@sample.kitchen", "duration_ms": 21000},
    "segments": [
      {"id": "title-0", "type": "title", "text": "고추장 덮밥"},
      {"id": "desc-0", "type": "description", "text": "설탕 1 큰술, 간장 2큰술"},
      {"id": "comment-0", "type": "comment", "text": "참기름 약간"},
      {"id": "asr-0", "type": "asr", "start_ms": 0, "end_ms": 2000, "text": "고추장 2큰술 넣고 간장 2큰술"},
      {"id": "ocr-0", "type": "ocr", "start_ms": 1000, "end_ms": 3000, "text": "고추장 2큰술"},
      {"id": "asr-1", "type": "asr", "start_ms": 2000, "end_ms": 4000, "text": "마늘을 넣어요"}]}',
  '{"title": "덮밥", "ingredients": [
     {"id": "ing-1", "name": "고추장", "amount_raw": "2큰술", "amount_status": "confirmed", "evidence": ["asr-0", "ocr-0"]},
     {"id": "ing-2", "name": "간장", "amount_raw": "2 큰술", "amount_status": "confirmed", "evidence": ["desc-0", "asr-0"]},
     {"id": "ing-3", "name": "설탕", "amount_raw": "1큰술", "amount_status": "confirmed", "evidence": ["desc-0"]},
     {"id": "ing-4", "name": "참기름", "amount_raw": "약간", "amount_status": "confirmed", "evidence": ["comment-0"]},
     {"id": "ing-5", "name": "마늘", "amount_raw": "한 쪽", "amount_status": "confirmed", "evidence": ["desc-0", "asr-1"]},
     {"id": "ing-6", "name": "소금", "amount_raw": null, "amount_status": "unconfirmed", "evidence": ["asr-0"],
      "amount_estimate": {"text": "약간", "basis": "2인분 기준"}}],
   "steps": [{"id": "step-1", "order": 1, "text": "섞는다", "evidence": ["asr-0"]}]}');

insert into public.user_recipes (id, user_id, run_id, title, ingredients, steps) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'r', '[]', '[]');

-- 로그인 없이
set local role anon;
select set_config('request.jwt.claims', '', true);

select is((select platform from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')), 'youtube', '플랫폼');
select is((select creator from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')), '@sample.kitchen', '크리에이터');
select is((select duration_ms from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')), 21000::bigint, '영상 길이');
select is((select thumbnail_url from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
  'https://i.ytimg.com/vi/Smpl0Gochu1/hqdefault.jpg', '썸네일');
select is((select save_count from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')), 1, '저장 수');
select is((select my_recipe_id from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')), null, '로그인 전에는 my_recipe_id 없음');

-- 분량 출처: 분량 글자가 든 근거 구간 종류, 여러 종류면 on_screen > voice > description
select is((select recipe -> 'ingredients' -> 0 ->> 'amount_source' from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
  'on_screen', '말과 화면 글자 둘 다에 있으면 on_screen');
select is((select recipe -> 'ingredients' -> 1 ->> 'amount_source' from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
  'voice', '설명과 말 둘 다에 있으면 voice(띄어쓰기는 무시)');
select is((select recipe -> 'ingredients' -> 2 ->> 'amount_source' from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
  'description', '설명에만 있으면 description');
select is((select recipe -> 'ingredients' -> 3 ->> 'amount_source' from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
  'description', '고정 댓글도 description');
select is((select recipe -> 'ingredients' -> 4 ->> 'amount_source' from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
  'voice', '분량 글자가 어디에도 없으면 근거 종류 순서로');
select is((select recipe -> 'ingredients' -> 5 -> 'amount_source' from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
  'null'::jsonb, '확인 안 된 분량은 null');
select is((select recipe -> 'ingredients' -> 5 -> 'amount_estimate' from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
  null, '로그인 전에는 추정값을 뺀다(#45 그대로)');
reset role;

-- 저장한 사람
select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
select is((select my_recipe_id from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
  'bbbbbbbb-0000-0000-0000-000000000001'::uuid, '저장했으면 내 레시피 ID');
select is((select recipe -> 'ingredients' -> 5 -> 'amount_estimate' ->> 'text' from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')),
  '약간', '로그인하면 추정값이 온다');
reset role;

-- 저장 안 한 사람
select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
select is((select my_recipe_id from public.get_run('aaaaaaaa-0000-0000-0000-000000000001')), null, '남이 저장한 건 내 레시피가 아니다');
reset role;

select * from finish();
rollback;
