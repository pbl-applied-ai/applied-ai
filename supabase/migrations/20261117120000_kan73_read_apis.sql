-- KAN-73 읽기 API: 홈 추천 목록, 레시피 상세(get_run) 확장, 레시피북 목록.
-- 응답 모양은 docs/screen-data.md 7절(웹 타입은 camelCase, 여기는 snake_case).
-- 카테고리 표는 list_recipes가 category_ids를 주려고 여기서 만든다. 만들고 고르는 RPC는 다음 PR(카테고리).

-- ── 표 ─────────────────────────────────────────────────

-- 홈 추천(Trending). 팀이 직접 넣고 웹은 list_featured()로만 읽는다.
create table public.featured_runs (
  run_id uuid primary key references public.runs (id) on delete cascade,
  categories text[] not null default '{}'
    check (categories <@ array['thanksgiving', 'christmas', 'budget', 'quick']),  -- Home 칩(#57 3절 8번)
  position integer not null default 0,  -- 작을수록 앞
  created_at timestamptz not null default now()
);

-- 내 카테고리(K 시트·B 칩). 이름은 내 카테고리 안에서 대소문자 무시하고 겹치지 않는다.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 30),
  emoji text check (emoji is null or length(emoji) <= 16),
  created_at timestamptz not null default now()
);
create unique index categories_user_name_idx on public.categories (user_id, lower(btrim(name)));

create table public.recipe_categories (
  recipe_id uuid not null references public.user_recipes (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (recipe_id, category_id)
);
create index recipe_categories_category_idx on public.recipe_categories (category_id);

-- 웹에서 직접 읽고 쓰지 않는다(RPC로만). Supabase 기본 권한을 걷어 낸다.
alter table public.featured_runs enable row level security;
alter table public.categories enable row level security;
alter table public.recipe_categories enable row level security;
revoke all on public.featured_runs, public.categories, public.recipe_categories from anon, authenticated;

-- ── 계산 (RPC 안에서만 쓴다) ───────────────────────────

-- canonical_key(youtube:<id> · instagram:<code> · upload:<uuid>) → 플랫폼
create function public.run_platform(p_canonical_key text) returns text
language sql immutable set search_path = '' as $$
  select case split_part(p_canonical_key, ':', 1)
           when 'youtube' then 'youtube'
           when 'instagram' then 'instagram'
           else 'upload'
         end
$$;

-- YouTube만 썸네일 주소를 만든다. 이미지를 받아 저장하지 않는다(#57 5절). 나머지는 null → 요리명 글자 카드.
create function public.run_thumbnail(p_canonical_key text) returns text
language sql immutable set search_path = '' as $$
  select case when p_canonical_key ~ '^youtube:[A-Za-z0-9_-]{11}$'
              then 'https://i.ytimg.com/vi/' || substr(p_canonical_key, 9) || '/hqdefault.jpg' end
$$;

create function public.run_duration_ms(p_bundle jsonb) returns bigint
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_bundle -> 'source' -> 'duration_ms') = 'number'
              then (p_bundle -> 'source' ->> 'duration_ms')::numeric::bigint end
$$;

-- 확정 분량이 나온 근거 종류(#57 3절 2번). 분량 글자(공백·대소문자 무시)가 든 근거 구간의 종류를 쓰고,
-- 여러 종류면 on_screen > voice > description. 글자가 어디에도 없으면 근거 종류 순서로 정한다.
-- 확인 안 된 분량은 null(화면은 칩을 숨긴다).
create function public.with_amount_sources(p_recipe jsonb, p_bundle jsonb) returns jsonb
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
                  order by strpos(lower(regexp_replace(coalesce(s.seg ->> 'text', ''), '\s', '', 'g')),
                                  lower(regexp_replace(i.item ->> 'amount_raw', '\s', '', 'g'))) > 0 desc,
                           case s.seg ->> 'type' when 'ocr' then 1 when 'asr' then 2 else 3 end
                  limit 1))
               order by i.n)
          from jsonb_array_elements(p_recipe -> 'ingredients') with ordinality as i(item, n)),
        '[]'::jsonb))
    else p_recipe
  end
$$;

revoke execute on function public.run_platform(text), public.run_thumbnail(text), public.run_duration_ms(jsonb),
  public.with_amount_sources(jsonb, jsonb) from public, anon, authenticated;

-- ── RPC: 로그인 없이 ───────────────────────────────────

-- 홈 추천 목록(H). 칩·검색은 웹이 거른다(20~40편).
create function public.list_featured()
returns table (
  run_id uuid, title text, creator text, platform text, source_url text, duration_ms bigint, thumbnail_url text,
  ingredient_names text[], ingredient_count integer, step_count integer, categories text[], save_count integer
)
language sql stable security definer set search_path = '' as $$
  select r.id,
         r.recipe ->> 'title',
         r.bundle -> 'source' ->> 'channel',
         public.run_platform(r.canonical_key),
         case when r.source_url like 'upload:%' then '' else r.source_url end,
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

-- 레시피 상세(D·R). 반환 열이 바뀌어 지우고 다시 만든다. 지우면 권한도 사라지므로 아래에서 다시 준다.
-- 로그인 전에는 추정값을 뺀다(#45 그대로, #57 3절 1번). my_recipe_id는 로그인했고 이 run을 저장했을 때만.
drop function public.get_run(uuid);

create function public.get_run(p_run_id uuid)
returns table (
  id uuid, source_url text, recipe jsonb, partial boolean, created_at timestamptz,
  platform text, creator text, duration_ms bigint, thumbnail_url text, save_count integer, my_recipe_id uuid
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.source_url,
         public.with_amount_sources(
           case
             when auth.uid() is null and jsonb_typeof(r.recipe -> 'ingredients') = 'array' then
               jsonb_set(r.recipe, '{ingredients}', coalesce(
                 (select jsonb_agg(i.item - 'amount_estimate' order by i.n)
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

-- ── RPC: 로그인 필요 ───────────────────────────────────

-- 레시피북 목록(B, H 최근). 최근 저장 순. p_limit이 1~200이면 그만큼, p_category_id면 그 카테고리만.
-- unconfirmed_count는 분량이 빈 재료 수("N to check", web editable.ts unconfirmedCount와 같은 뜻).
create function public.list_recipes(p_limit integer default null, p_category_id uuid default null)
returns table (
  id uuid, run_id uuid, title text, ingredient_count integer, step_count integer, unconfirmed_count integer,
  source_url text, platform text, thumbnail_url text, category_ids uuid[], created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query
    select u.id, u.run_id, u.title,
           jsonb_array_length(u.ingredients),
           jsonb_array_length(u.steps),
           (select count(*)::integer from jsonb_array_elements(u.ingredients) x
             where nullif(btrim(coalesce(x ->> 'amount_raw', '')), '') is null),
           r.source_url,
           public.run_platform(r.canonical_key),
           public.run_thumbnail(r.canonical_key),
           coalesce(array(select rc.category_id from public.recipe_categories rc
                           where rc.recipe_id = u.id order by rc.category_id), '{}'),
           u.created_at, u.updated_at
      from public.user_recipes u
      join public.runs r on r.id = u.run_id
     where u.user_id = v_user
       and (p_category_id is null or exists (
             select 1 from public.recipe_categories rc where rc.recipe_id = u.id and rc.category_id = p_category_id))
     order by u.created_at desc, u.id
     limit case when p_limit between 1 and 200 then p_limit end;
end;
$$;

-- ── 권한 ───────────────────────────────────────────────

revoke execute on function public.list_featured(), public.get_run(uuid), public.list_recipes(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.list_featured(), public.get_run(uuid) to anon, authenticated;
grant execute on function public.list_recipes(integer, uuid) to authenticated;
