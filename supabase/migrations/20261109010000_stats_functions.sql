-- 성능: 풀이 기록을 DB 에서 문항 단위로 집계한다 (사용자 본인 기록만, RLS 적용)
create or replace function public.my_question_stats(p_subject uuid)
returns table (
  question_id uuid,
  attempt_count int,
  wrong_count int,
  last_correct boolean,
  last_graded_at timestamptz,
  wrong_after boolean,
  confused_after boolean,
  saved boolean,
  last_weak_at timestamptz
)
language sql stable security invoker as $$
  with q as (select id from public.questions where subject_id = p_subject),
  d as (select question_id, at from public.question_marks where user_id = auth.uid() and kind = 'dismissed'),
  sv as (select question_id, at from public.question_marks where user_id = auth.uid() and kind = 'saved'),
  a as (select a.* from public.attempts a join q on q.id = a.question_id where a.user_id = auth.uid()),
  graded as (
    select question_id,
      count(*) filter (where selected_ord is not null) as cnt,
      count(*) filter (where is_correct = false) as wrong,
      (array_agg(is_correct order by created_at desc) filter (where selected_ord is not null and is_correct is not null))[1] as last_correct,
      max(created_at) filter (where selected_ord is not null) as last_graded_at
    from a group by question_id
  ),
  weak as (
    select a.question_id,
      bool_or(a.is_correct = false and (d.at is null or a.created_at > d.at)) as wrong_after,
      bool_or(a.confused and (d.at is null or a.created_at > d.at)) as confused_after,
      max(a.created_at) filter (where (a.is_correct = false or a.confused) and (d.at is null or a.created_at > d.at)) as last_weak_at
    from a left join d on d.question_id = a.question_id
    group by a.question_id
  ),
  ids as (
    select question_id from graded union select question_id from weak union select question_id from sv
  )
  select i.question_id,
    coalesce(g.cnt, 0)::int,
    coalesce(g.wrong, 0)::int,
    g.last_correct,
    g.last_graded_at,
    coalesce(w.wrong_after, false),
    coalesce(w.confused_after, false),
    (s.question_id is not null and (dd.at is null or s.at > dd.at)) as saved,
    greatest(w.last_weak_at, case when s.question_id is not null and (dd.at is null or s.at > dd.at) then s.at end)
  from ids i
  left join graded g on g.question_id = i.question_id
  left join weak w on w.question_id = i.question_id
  left join sv s on s.question_id = i.question_id
  left join d dd on dd.question_id = i.question_id
$$;

-- 단원별 문항 수 (RLS 적용)
create or replace function public.question_counts_by_unit(p_subject uuid)
returns table (unit_id uuid, n bigint)
language sql stable security invoker as $$
  select unit_id, count(*) from public.questions where subject_id = p_subject group by unit_id
$$;
