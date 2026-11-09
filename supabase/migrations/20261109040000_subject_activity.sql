-- 주제별 내 활동 요약 (주제 수만큼의 행만 돌려준다). 주제 정렬에 쓴다.
create or replace function public.my_subject_activity()
returns table (subject_id uuid, weak_count bigint, attempt_count bigint, last_at timestamptz)
language sql stable security invoker as $$
  with a as (
    select q.subject_id,
      count(*) filter (where at.is_correct = false or at.confused) as weak_count,
      count(*) as attempt_count,
      max(at.created_at) as last_at
    from public.attempts at join public.questions q on q.id = at.question_id
    where at.user_id = auth.uid()
    group by q.subject_id
  ),
  m as (
    select q.subject_id, count(*) as saved_count, max(mk.at) as last_at
    from public.question_marks mk join public.questions q on q.id = mk.question_id
    where mk.user_id = auth.uid() and mk.kind = 'saved'
    group by q.subject_id
  )
  select coalesce(a.subject_id, m.subject_id),
    coalesce(a.weak_count, 0) + coalesce(m.saved_count, 0),
    coalesce(a.attempt_count, 0),
    greatest(a.last_at, m.last_at)
  from a full join m on m.subject_id = a.subject_id
$$;
create index if not exists attempts_user_question_idx on public.attempts(user_id, question_id);
create index if not exists question_marks_user_kind_idx on public.question_marks(user_id, kind);
