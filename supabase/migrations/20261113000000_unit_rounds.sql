-- 회독 표시: 단원별로 "문항을 k회 푼 문항이 n개" 히스토그램을 돌려준다 (현재 사용자 기준, 채점된 풀이만).
-- 화면에서 하위 단원을 합쳐 "1회독" / "2회독 중 21/25" 를 계산한다.
create or replace function public.my_unit_rounds(p_subject uuid)
returns table (unit_id uuid, attempts int, n bigint)
language sql stable security invoker as $$
  with q as (select id, unit_id from public.questions where subject_id = p_subject),
  c as (
    select q.unit_id, q.id, count(a.id) filter (where a.selected_ord is not null) as cnt
    from q left join public.attempts a on a.question_id = q.id and a.user_id = auth.uid()
    group by q.unit_id, q.id
  )
  select c.unit_id, c.cnt::int, count(*) from c group by c.unit_id, c.cnt
$$;
grant execute on function public.my_unit_rounds(uuid) to authenticated;
