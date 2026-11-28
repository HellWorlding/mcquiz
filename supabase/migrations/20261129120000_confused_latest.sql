-- D-013: 헷갈림(confused_after)을 "마지막 풀이의 값" 으로. 저장함의 헷갈림 목록·퀴즈 시작 시 헷갈림 유지가 모두 이 값을 쓴다.
-- 시그니처·반환 열은 그대로이므로 타입 재생성 불필요.

create or replace function learning.question_stats(p_subject uuid, p_user uuid default null)
returns table (
  question_id uuid, unit_id uuid, set_id uuid, tags text[], topic text, difficulty text, trap_types text[],
  attempt_count integer, wrong_count integer, last_correct boolean, last_graded_at timestamptz,
  wrong_after boolean, confused_after boolean, saved boolean, last_weak_at timestamptz
) language sql stable set search_path = '' as $$
  with q as (select id, unit_id, set_id, tags, topic, difficulty, trap_types from catalog.questions where subject_id = p_subject),
  d as (select m.question_id, m.at from learning.marks m join q on q.id = m.question_id where m.user_id = (select learning.effective_user(p_user)) and m.kind = 'dismissed'),
  sv as (select m.question_id, m.at from learning.marks m join q on q.id = m.question_id where m.user_id = (select learning.effective_user(p_user)) and m.kind = 'saved'),
  a as (select a.* from learning.attempts a join q on q.id = a.question_id where a.user_id = (select learning.effective_user(p_user))),
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
      -- D-013: 헷갈림은 "가장 최근 풀이(빼기 이후)" 의 값. 끄면 그 뒤로는 꺼진다 (bool_or 였을 때는 한 번 켜면 영원히 켜짐)
      coalesce((array_agg(a.confused order by a.created_at desc, a.id desc) filter (where d.at is null or a.created_at > d.at))[1], false) as confused_after,
      max(a.created_at) filter (where (a.is_correct = false or a.confused) and (d.at is null or a.created_at > d.at)) as last_weak_at
    from a left join d on d.question_id = a.question_id
    group by a.question_id
  ),
  ids as (select question_id from graded union select question_id from weak union select question_id from sv)
  select i.question_id, q.unit_id, q.set_id, q.tags, q.topic, q.difficulty, q.trap_types,
    coalesce(g.cnt, 0)::int, coalesce(g.wrong, 0)::int, g.last_correct, g.last_graded_at,
    coalesce(w.wrong_after, false), coalesce(w.confused_after, false),
    (s.question_id is not null and (dd.at is null or s.at > dd.at)) as saved,
    greatest(w.last_weak_at, case when s.question_id is not null and (dd.at is null or s.at > dd.at) then s.at end)
  from ids i
  join q on q.id = i.question_id
  left join graded g on g.question_id = i.question_id
  left join weak w on w.question_id = i.question_id
  left join sv s on s.question_id = i.question_id
  left join d dd on dd.question_id = i.question_id
$$;
