-- 회독 히스토그램에 "최근 풀이가 정답인 문항 수"를 더한다 (완료된 회독 배지에 정답률을 붙이기 위해).
drop function if exists public.my_unit_rounds(uuid);
create or replace function public.my_unit_rounds(p_subject uuid)
returns table (unit_id uuid, attempts int, n bigint, n_correct bigint)
language sql stable security invoker as $$
  with q as (select id, unit_id from public.questions where subject_id = p_subject),
  c as (
    select q.unit_id, q.id,
           count(a.id) filter (where a.selected_ord is not null) as cnt,
           (array_agg(a.is_correct order by a.created_at desc) filter (where a.selected_ord is not null))[1] as latest_correct
    from q left join public.attempts a on a.question_id = q.id and a.user_id = auth.uid()
    group by q.unit_id, q.id
  )
  select c.unit_id, c.cnt::int, count(*), count(*) filter (where c.latest_correct)
  from c group by c.unit_id, c.cnt
$$;
grant execute on function public.my_unit_rounds(uuid) to authenticated;
