-- 회독 진행(다음 바퀴 p/N)은 "끝내지 않은 풀이 세션"에서만 계산한다.
-- 틀린 것만 다시 풀기처럼 일부 문항만 다시 푼 기록은 회독 진행으로 치지 않는다.
-- 세션별·단원별로 (세션에 든 문항 수, 그중 답한 수)를 돌려준다. 현재 사용자 기준.
create or replace function public.my_unit_progress(p_subject uuid)
returns table (session_id uuid, unit_id uuid, covered bigint, answered bigint)
language sql stable security invoker as $$
  with s as (
    select id, question_ids, answers
    from public.quiz_sessions
    where user_id = auth.uid() and subject_id = p_subject and finished = false
  ),
  sq as (
    select s.id as session_id, q.unit_id,
           (s.answers -> q.id::text ->> 'selectedOrd') is not null as answered
    from s
    cross join unnest(s.question_ids) as u(qid)
    join public.questions q on q.id = u.qid
  )
  select session_id, unit_id, count(*), count(*) filter (where answered)
  from sq group by session_id, unit_id
$$;
grant execute on function public.my_unit_progress(uuid) to authenticated;
