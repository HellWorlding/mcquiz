-- 회독별 정답률: 문항마다 i번째 풀이가 맞았는지 세어 단원별·회독별 (푼 문항 수, 정답 수)를 돌려준다. 현재 사용자 기준.
create or replace function public.my_unit_round_scores(p_subject uuid)
returns table (unit_id uuid, round_no int, n bigint, n_correct bigint)
language sql stable security invoker as $$
  with q as (select id, unit_id from public.questions where subject_id = p_subject),
  a as (
    select q.unit_id, a.is_correct,
           row_number() over (partition by a.question_id order by a.created_at, a.id) as rn
    from q join public.attempts a on a.question_id = q.id and a.user_id = auth.uid()
    where a.selected_ord is not null
  )
  select a.unit_id, a.rn::int, count(*), count(*) filter (where a.is_correct)
  from a group by a.unit_id, a.rn
$$;
grant execute on function public.my_unit_round_scores(uuid) to authenticated;
