-- 성능: 집계 결과에 문항 메타를 함께 실어 주제 문항 전체 조회를 없앤다
drop function if exists public.my_question_stats(uuid);
create or replace function public.my_question_stats(p_subject uuid)
returns table (
  question_id uuid,
  unit_id uuid,
  set_id uuid,
  tags text[],
  topic text,
  difficulty text,
  trap_types text[],
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
  with q as (select id, unit_id, set_id, tags, topic, difficulty, trap_types from public.questions where subject_id = p_subject),
  d as (select m.question_id, m.at from public.question_marks m join q on q.id = m.question_id where m.user_id = auth.uid() and m.kind = 'dismissed'),
  sv as (select m.question_id, m.at from public.question_marks m join q on q.id = m.question_id where m.user_id = auth.uid() and m.kind = 'saved'),
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
  select i.question_id, q.unit_id, q.set_id, q.tags, q.topic, q.difficulty, q.trap_types,
    coalesce(g.cnt, 0)::int,
    coalesce(g.wrong, 0)::int,
    g.last_correct,
    g.last_graded_at,
    coalesce(w.wrong_after, false),
    coalesce(w.confused_after, false),
    (s.question_id is not null and (dd.at is null or s.at > dd.at)) as saved,
    greatest(w.last_weak_at, case when s.question_id is not null and (dd.at is null or s.at > dd.at) then s.at end)
  from ids i
  join q on q.id = i.question_id
  left join graded g on g.question_id = i.question_id
  left join weak w on w.question_id = i.question_id
  left join sv s on s.question_id = i.question_id
  left join d dd on dd.question_id = i.question_id
$$;

-- 약점 섞어 풀기용: 아직 채점된 풀이가 없는 문항
create or replace function public.my_unseen_questions(p_subject uuid)
returns table (id uuid, unit_id uuid, set_id uuid, tags text[])
language sql stable security invoker as $$
  select q.id, q.unit_id, q.set_id, q.tags
  from public.questions q
  where q.subject_id = p_subject
    and not exists (select 1 from public.attempts a where a.user_id = auth.uid() and a.question_id = q.id and a.selected_ord is not null)
$$;
