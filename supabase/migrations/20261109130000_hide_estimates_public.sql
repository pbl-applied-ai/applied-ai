-- 로그인 전 공개 링크(/r/<run_id>)에서는 AI 추정 분량을 보여 주지 않는다(#31, KAN-52).
-- 화면에서만 숨기면 get_run 응답 JSON에는 남으므로, 로그인하지 않았으면 조회에서 뺀다.
-- 로그인한 사람의 확인·수정 화면(S4)은 같은 get_run으로 추정값을 받는다.

create or replace function public.get_run(p_run_id uuid)
returns table (id uuid, source_url text, recipe jsonb, partial boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.source_url,
         case
           when auth.uid() is null and jsonb_typeof(r.recipe -> 'ingredients') = 'array' then
             jsonb_set(r.recipe, '{ingredients}', coalesce(
               (select jsonb_agg(i.item - 'amount_estimate' order by i.n)
                from jsonb_array_elements(r.recipe -> 'ingredients') with ordinality as i(item, n)),
               '[]'::jsonb))
           else r.recipe
         end,
         r.partial, r.created_at
  from public.runs r
  where r.id = p_run_id;
$$;

revoke execute on function public.get_run(uuid) from public, anon, authenticated;
grant execute on function public.get_run(uuid) to anon, authenticated;
