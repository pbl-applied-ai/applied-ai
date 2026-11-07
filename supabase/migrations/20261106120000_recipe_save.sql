-- 레시피북 저장·수정·상세 RPC (KAN-23)
-- 읽기 목록·삭제는 RLS(user_recipes_select_own·delete_own)로 이미 열려 있다. 저장·수정은 여기로만 한다.
--
-- 클라이언트가 보낸 amount_status·edited·user_entered는 믿지 않는다. 항목 ID(ing-N은 추출 결과의 N번째)로
-- run.recipe와 비교해 서버가 다시 정한다. 분량이 원본과 같고 원본이 confirmed일 때만 confirmed다.
-- 항목 ID 번호는 1부터다. ing-0은 인덱스 -1이라 마지막 재료와 비교되고, ing-01은 ing-1과 같은 항목이어서 받지 않는다.
-- 항목 ID 형식·user_entered는 KAN-9(스키마 v0.2) 합의 전 임시안이다.

-- ── 입력 검사·상태 계산 (RPC 안에서만 쓴다) ───────────────

create function public.checked_ingredients(p_recipe jsonb, p_items jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_out jsonb := '[]';
  v_seen text[] := '{}';
  v_item jsonb;
  v_orig jsonb;
  v_id text;
  v_name text;
  v_amount text;
  v_optional boolean;
  v_same_amount boolean;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'invalid ingredients' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_id := v_item ->> 'id';
    if v_id is null or v_id !~ '^ing-(user-)?[1-9][0-9]{0,3}$' or v_id = any (v_seen) then
      raise exception 'invalid ingredient id' using errcode = '22023';
    end if;
    v_seen := v_seen || v_id;
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    continue when v_name = '';  -- 이름을 지운 줄은 저장하지 않는다
    v_amount := nullif(btrim(coalesce(v_item ->> 'amount_raw', '')), '');
    if length(v_name) > 200 or length(v_amount) > 200 then
      raise exception 'ingredient too long' using errcode = '22023';
    end if;
    v_optional := coalesce(v_item -> 'optional' = 'true'::jsonb, false);
    v_orig := case when v_id ~ '^ing-[0-9]+$' then p_recipe -> 'ingredients' -> (substr(v_id, 5)::integer - 1) end;
    v_same_amount := v_orig is not null and v_amount is not distinct from v_orig ->> 'amount_raw';
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_id,
      'name', v_name,
      'amount_raw', v_amount,
      'amount_status', case when v_same_amount and v_orig ->> 'amount_status' = 'confirmed' then 'confirmed' else 'unconfirmed' end,
      'edited', v_orig is null or not v_same_amount or v_name is distinct from v_orig ->> 'name'
        or v_optional <> coalesce(v_orig -> 'optional' = 'true'::jsonb, false),
      'user_entered', v_orig is null or (v_amount is not null and not v_same_amount)
    ) || case when v_optional then '{"optional": true}'::jsonb else '{}'::jsonb end);
  end loop;
  return v_out;
end;
$$;

create function public.checked_steps(p_recipe jsonb, p_items jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_out jsonb := '[]';
  v_seen text[] := '{}';
  v_sorted jsonb;
  v_item jsonb;
  v_orig jsonb;
  v_id text;
  v_text text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'invalid steps' using errcode = '22023';
  end if;
  -- 화면(toEditable)과 같이 추출 결과의 order 순서로 step-N을 붙인다
  select coalesce(jsonb_agg(s order by (s ->> 'order')::integer), '[]') into v_sorted
  from jsonb_array_elements(coalesce(p_recipe -> 'steps', '[]')) s;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_id := v_item ->> 'id';
    if v_id is null or v_id !~ '^step-(user-)?[1-9][0-9]{0,3}$' or v_id = any (v_seen) then
      raise exception 'invalid step id' using errcode = '22023';
    end if;
    v_seen := v_seen || v_id;
    v_text := btrim(coalesce(v_item ->> 'text', ''));
    continue when v_text = '';
    if length(v_text) > 2000 then
      raise exception 'step too long' using errcode = '22023';
    end if;
    v_orig := case when v_id ~ '^step-[0-9]+$' then v_sorted -> (substr(v_id, 6)::integer - 1) end;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_id,
      'text', v_text,
      'edited', v_orig is null or v_text is distinct from v_orig ->> 'text',
      'user_entered', v_orig is null
    ));
  end loop;
  return v_out;
end;
$$;

-- 제목·인분을 검사하고 재료·단계를 계산해 돌려준다. 재료·단계는 1개 이상이어야 저장된다.
create function public.checked_recipe(p_recipe jsonb, p_title text, p_servings_raw text, p_ingredients jsonb, p_steps jsonb)
returns table (title text, servings_raw text, ingredients jsonb, steps jsonb)
language plpgsql stable set search_path = '' as $$
begin
  title := btrim(coalesce(p_title, ''));
  servings_raw := nullif(btrim(coalesce(p_servings_raw, '')), '');
  if length(title) not between 1 and 200 or length(servings_raw) > 200 then
    raise exception 'invalid title or servings' using errcode = '22023';
  end if;
  ingredients := public.checked_ingredients(p_recipe, p_ingredients);
  steps := public.checked_steps(p_recipe, p_steps);
  if jsonb_array_length(ingredients) = 0 or jsonb_array_length(steps) = 0 then
    raise exception 'recipe needs ingredients and steps' using errcode = '22023';
  end if;
  return next;
end;
$$;

-- ── RPC: 로그인 사용자 ───────────────────────────────────

-- 같은 영상을 또 저장하면 기존 레시피를 고친다(unique (user_id, run_id)).
create function public.save_recipe(
  p_run_id uuid, p_title text, p_servings_raw text, p_ingredients jsonb, p_steps jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_recipe jsonb;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select r.recipe into v_recipe from public.runs r where r.id = p_run_id;
  if not found then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  insert into public.user_recipes (user_id, run_id, title, servings_raw, ingredients, steps)
  select v_user, p_run_id, c.title, c.servings_raw, c.ingredients, c.steps
  from public.checked_recipe(v_recipe, p_title, p_servings_raw, p_ingredients, p_steps) c
  on conflict (user_id, run_id) do update
    set title = excluded.title, servings_raw = excluded.servings_raw,
        ingredients = excluded.ingredients, steps = excluded.steps
  returning id into v_id;
  return v_id;
end;
$$;

-- 내 레시피만 고친다. 남의 레시피는 없는 것과 같다.
create function public.update_recipe(
  p_id uuid, p_title text, p_servings_raw text, p_ingredients jsonb, p_steps jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_recipe jsonb;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select r.recipe into v_recipe
  from public.user_recipes u join public.runs r on r.id = u.run_id
  where u.id = p_id and u.user_id = v_user;
  if not found then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  update public.user_recipes u
  set title = c.title, servings_raw = c.servings_raw, ingredients = c.ingredients, steps = c.steps
  from public.checked_recipe(v_recipe, p_title, p_servings_raw, p_ingredients, p_steps) c
  where u.id = p_id and u.user_id = v_user;
end;
$$;

-- 상세 화면. 원본 링크는 runs에 있고 로그인 사용자는 runs를 직접 읽지 못해서 RPC로 준다.
create function public.get_recipe(p_id uuid)
returns table (
  id uuid, run_id uuid, source_url text, title text, servings_raw text,
  ingredients jsonb, steps jsonb, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select u.id, u.run_id, r.source_url, u.title, u.servings_raw, u.ingredients, u.steps, u.created_at, u.updated_at
  from public.user_recipes u join public.runs r on r.id = u.run_id
  where u.id = p_id and u.user_id = auth.uid();
$$;

-- ── 실행 권한 ────────────────────────────────────────────

revoke execute on function
  public.checked_ingredients(jsonb, jsonb),
  public.checked_steps(jsonb, jsonb),
  public.checked_recipe(jsonb, text, text, jsonb, jsonb),
  public.save_recipe(uuid, text, text, jsonb, jsonb),
  public.update_recipe(uuid, text, text, jsonb, jsonb),
  public.get_recipe(uuid)
  from public, anon, authenticated;

grant execute on function
  public.save_recipe(uuid, text, text, jsonb, jsonb),
  public.update_recipe(uuid, text, text, jsonb, jsonb),
  public.get_recipe(uuid)
  to authenticated;
