-- KAN-73 후속: 카테고리 RPC, #63 리뷰 반영(분량 출처 숫자 경계·업로드 원본 null), 로그인 전 잠금 배지용 has_estimate(#64 시안).

-- ── #63 후속: 계산 함수·읽기 RPC 고치기 (반환 모양은 그대로) ─────────

-- 분량 글자가 문장에 숫자 경계를 지켜 나오는지(공백·대소문자 무시). 평가 스크립트 contains_amount와 같은 규칙:
-- "1"은 "10초"·"1.5"·"2~1" 안에서 찾지 않는다. 출처 칩을 고를 때만 쓴다.
create function public.amount_in_text(p_amount text, p_text text) returns boolean
language sql immutable set search_path = '' as $$
  with n as (
    select lower(regexp_replace(coalesce(p_amount, ''), '\s', '', 'g')) as a,
           lower(regexp_replace(coalesce(p_text, ''), '\s', '', 'g')) as t
  )
  select n.a <> '' and n.t ~ (
           case when n.a ~ '^[0-9]' then '(?<![0-9])(?<![0-9][.,/~–-])' else '' end
           || regexp_replace(n.a, '([]^$*+?(){}|\\/.[-])', '\\\1', 'g')  -- "[." 은 대조 원소라 [ 를 . 뒤에 둔다
           || case when n.a ~ '[0-9]$' then '(?![0-9])(?![.,/][0-9])' else '' end)
    from n
$$;

create or replace function public.with_amount_sources(p_recipe jsonb, p_bundle jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(p_recipe -> 'ingredients') = 'array' then
      jsonb_set(p_recipe, '{ingredients}', coalesce((
        select jsonb_agg(i.item || jsonb_build_object('amount_source', (
                 select case s.seg ->> 'type' when 'ocr' then 'on_screen' when 'asr' then 'voice' else 'description' end
                   from jsonb_array_elements(case when jsonb_typeof(p_bundle -> 'segments') = 'array'
                                                  then p_bundle -> 'segments' else '[]'::jsonb end) s(seg)
                  where i.item ->> 'amount_status' = 'confirmed'
                    and nullif(btrim(i.item ->> 'amount_raw'), '') is not null
                    and jsonb_typeof(i.item -> 'evidence') = 'array'
                    and i.item -> 'evidence' ? (s.seg ->> 'id')
                  order by public.amount_in_text(i.item ->> 'amount_raw', s.seg ->> 'text') desc,
                           case s.seg ->> 'type' when 'ocr' then 1 when 'asr' then 2 else 3 end
                  limit 1))
               order by i.n)
          from jsonb_array_elements(p_recipe -> 'ingredients') with ordinality as i(item, n)),
        '[]'::jsonb))
    else p_recipe
  end
$$;

-- 추정값이 있는 재료에 has_estimate: true. 로그인 전에는 값(amount_estimate)만 빼고 표시는 남긴다(잠금 배지 "Sign in to see").
create or replace function public.get_run(p_run_id uuid)
returns table (
  id uuid, source_url text, recipe jsonb, partial boolean, created_at timestamptz,
  platform text, creator text, duration_ms bigint, thumbnail_url text, save_count integer, my_recipe_id uuid
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.source_url,
         public.with_amount_sources(
           case
             when jsonb_typeof(r.recipe -> 'ingredients') = 'array' then
               jsonb_set(r.recipe, '{ingredients}', coalesce(
                 (select jsonb_agg(
                           case when jsonb_typeof(i.item -> 'amount_estimate') = 'object'
                                then (case when auth.uid() is null then i.item - 'amount_estimate' else i.item end)
                                     || '{"has_estimate": true}'::jsonb
                                else i.item end
                           order by i.n)
                  from jsonb_array_elements(r.recipe -> 'ingredients') with ordinality as i(item, n)),
                 '[]'::jsonb))
             else r.recipe
           end,
           r.bundle),
         r.partial, r.created_at,
         public.run_platform(r.canonical_key),
         r.bundle -> 'source' ->> 'channel',
         public.run_duration_ms(r.bundle),
         public.run_thumbnail(r.canonical_key),
         (select count(*)::integer from public.user_recipes u where u.run_id = r.id),
         (select u.id from public.user_recipes u where auth.uid() is not null and u.user_id = auth.uid() and u.run_id = r.id)
  from public.runs r
  where r.id = p_run_id;
$$;

-- 업로드 원본 주소는 빈 문자열 대신 null(#63 리뷰). 추천에 업로드가 들어갈 일은 거의 없다.
create or replace function public.list_featured()
returns table (
  run_id uuid, title text, creator text, platform text, source_url text, duration_ms bigint, thumbnail_url text,
  ingredient_names text[], ingredient_count integer, step_count integer, categories text[], save_count integer
)
language sql stable security definer set search_path = '' as $$
  select r.id,
         r.recipe ->> 'title',
         r.bundle -> 'source' ->> 'channel',
         public.run_platform(r.canonical_key),
         case when r.source_url like 'upload:%' then null else r.source_url end,
         public.run_duration_ms(r.bundle),
         public.run_thumbnail(r.canonical_key),
         coalesce(array(select x ->> 'name'
                          from jsonb_array_elements(case when jsonb_typeof(r.recipe -> 'ingredients') = 'array'
                                                         then r.recipe -> 'ingredients' else '[]'::jsonb end)
                               with ordinality as t(x, n)
                         order by t.n), '{}'),
         case when jsonb_typeof(r.recipe -> 'ingredients') = 'array' then jsonb_array_length(r.recipe -> 'ingredients') else 0 end,
         case when jsonb_typeof(r.recipe -> 'steps') = 'array' then jsonb_array_length(r.recipe -> 'steps') else 0 end,
         f.categories,
         (select count(*)::integer from public.user_recipes u where u.run_id = r.id)
    from public.featured_runs f
    join public.runs r on r.id = f.run_id
   order by f.position, f.created_at, f.run_id;
$$;

-- ── 카테고리 ───────────────────────────────────────────

-- 레시피와 카테고리는 주인이 같아야 한다(#63 수빈 리뷰). RPC를 거치지 않고 넣어도 표가 막는다.
create function public.check_recipe_category_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select u.user_id from public.user_recipes u where u.id = new.recipe_id)
     is distinct from (select c.user_id from public.categories c where c.id = new.category_id) then
    raise exception 'recipe and category belong to different users' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger recipe_categories_same_owner
  before insert or update on public.recipe_categories
  for each row execute function public.check_recipe_category_owner();

-- 내 카테고리와 레시피 수(K 시트 "4 recipes", B 칩 "Pasta 4"). 만든 순서.
create function public.list_categories()
returns table (id uuid, name text, emoji text, recipe_count integer, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query
    select c.id, c.name, c.emoji,
           (select count(*)::integer from public.recipe_categories rc where rc.category_id = c.id),
           c.created_at
      from public.categories c
     where c.user_id = v_user
     order by c.created_at, c.name;
end;
$$;

-- 새 카테고리. 이름은 앞뒤 공백을 지우고 1~30자, 내 카테고리 안에서 대소문자 무시하고 겹치면 23505. 한 사람당 20개까지.
create function public.create_category(p_name text, p_emoji text default null)
returns table (id uuid, name text, emoji text, recipe_count integer, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 30 or length(v_emoji) > 16 then
    raise exception 'invalid category' using errcode = '22023';
  end if;
  if (select count(*) from public.categories c where c.user_id = v_user) >= 20 then
    raise exception 'too many categories' using errcode = '22023';
  end if;
  insert into public.categories (user_id, name, emoji) values (v_user, v_name, v_emoji) returning categories.id into v_id;
  return query select c.id, c.name, c.emoji, 0, c.created_at from public.categories c where c.id = v_id;
end;
$$;

-- 레시피의 카테고리를 통째로 바꾼다(빈 배열이면 다 뗀다). 저장·수정 뒤 웹이 이어서 부른다.
-- 내 레시피·내 카테고리가 아니면 42501.
create function public.set_recipe_categories(p_recipe_id uuid, p_category_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_category_ids, '{}')) x where x is not null);
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_recipes u where u.id = p_recipe_id and u.user_id = v_user) then
    raise exception 'not your recipe' using errcode = '42501';
  end if;
  if (select count(*) from public.categories c where c.id = any (v_ids) and c.user_id = v_user) <> cardinality(v_ids) then
    raise exception 'not your category' using errcode = '42501';
  end if;
  delete from public.recipe_categories rc where rc.recipe_id = p_recipe_id;
  insert into public.recipe_categories (recipe_id, category_id) select p_recipe_id, x from unnest(v_ids) x;
end;
$$;

-- ── 권한 ───────────────────────────────────────────────

revoke execute on function public.amount_in_text(text, text), public.check_recipe_category_owner()
  from public, anon, authenticated;
revoke execute on function public.list_categories(), public.create_category(text, text),
  public.set_recipe_categories(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.list_categories(), public.create_category(text, text),
  public.set_recipe_categories(uuid, uuid[]) to authenticated;
