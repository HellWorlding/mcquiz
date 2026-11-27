-- DDD 전환: 테이블·함수를 컨텍스트별 스키마로 옮긴다. 데이터는 그대로(set schema / rename).
--   access     profiles, subject_members                     is_admin, readable_subject_ids, can_read_subject, handle_new_user, guard_is_admin_change
--   catalog    subjects, units, questions, choices, question_sets, collections, collection_items
--              unit_subtree, question_counts_by_unit, classify_unit, can_read_collection, can_edit_collection
--   learning   attempts, quiz_sessions, marks(←question_marks), notes(←question_notes)
--              question_stats, unsolved_questions, unit_progress, unit_attempt_counts, unit_round_scores, subject_activity
--   knowledge  sources, chunks(←source_chunks), files(←subject_files), chat_logs(←ai_questions)
--              search_chunks, match_chunks
--   community  posts(←board_posts), reports(←question_reports), posts_view
-- public 에는 테이블·함수를 두지 않는다. 함수는 search_path 를 비우고 모든 이름을 스키마로 적는다.
-- 컨텍스트를 넘는 읽기 조인(예: learning 함수가 catalog.questions 를 읽음)은 읽기 모델로 허용, 쓰기는 소유 스키마만.

-- ---------------------------------------------------------------
-- 1. 스키마와 기본 권한
-- ---------------------------------------------------------------
create schema if not exists access;
create schema if not exists catalog;
create schema if not exists learning;
create schema if not exists knowledge;
create schema if not exists community;

do $$
declare s text;
begin
  foreach s in array array['access','catalog','learning','knowledge','community'] loop
    execute format('grant usage on schema %I to anon, authenticated, service_role', s);
    execute format('alter default privileges in schema %I grant all on tables to anon, authenticated, service_role', s);
    execute format('alter default privileges in schema %I grant all on sequences to anon, authenticated, service_role', s);
    execute format('alter default privileges in schema %I grant all on functions to anon, authenticated, service_role', s);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- 2. 옛 정책·뷰·트리거·함수 제거 (본문이 public.* 를 가리키므로 새로 만든다)
-- ---------------------------------------------------------------
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;
drop policy if exists "sources bucket: read if subject allowed" on storage.objects;

drop view if exists public.board_posts_view;
drop trigger if exists profiles_guard_is_admin on public.profiles;
drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.can_edit_collection(uuid);
drop function if exists public.can_read_collection(uuid);
drop function if exists public.can_read_subject(uuid);
drop function if exists public.classify_unit(uuid, text[]);
drop function if exists public.guard_is_admin_change();
drop function if exists public.handle_new_user();
drop function if exists public.is_admin();
drop function if exists public.match_chunks(uuid, extensions.vector, text[], uuid[], integer);
drop function if exists public.my_question_stats(uuid);
drop function if exists public.my_subject_activity();
drop function if exists public.my_unit_progress(uuid);
drop function if exists public.my_unit_round_scores(uuid);
drop function if exists public.my_unit_rounds(uuid);
drop function if exists public.my_unseen_questions(uuid);
drop function if exists public.question_counts_by_unit(uuid);
drop function if exists public.readable_subject_ids();
drop function if exists public.search_chunks(uuid, text[], uuid[], integer);
drop function if exists public.unit_subtree(uuid[]);

-- ---------------------------------------------------------------
-- 3. 테이블 이동 (행·인덱스·FK·RLS 설정 유지)
-- ---------------------------------------------------------------
alter table public.profiles set schema access;
alter table public.subject_members set schema access;

alter table public.subjects set schema catalog;
alter table public.units set schema catalog;
alter table public.questions set schema catalog;
alter table public.choices set schema catalog;
alter table public.question_sets set schema catalog;
alter table public.collections set schema catalog;
alter table public.collection_items set schema catalog;

alter table public.attempts set schema learning;
alter table public.quiz_sessions set schema learning;
alter table public.question_marks rename to marks;
alter table public.marks set schema learning;
alter table public.question_notes rename to notes;
alter table public.notes set schema learning;

alter table public.sources set schema knowledge;
alter table public.source_chunks rename to chunks;
alter table public.chunks set schema knowledge;
alter table public.subject_files rename to files;
alter table public.files set schema knowledge;
alter table public.ai_questions rename to chat_logs;
alter table public.chat_logs set schema knowledge;

alter table public.board_posts rename to posts;
alter table public.posts set schema community;
alter table public.question_reports rename to reports;
alter table public.reports set schema community;

-- ---------------------------------------------------------------
-- 4. access 함수
-- ---------------------------------------------------------------
create function access.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from access.profiles p where p.id = auth.uid()), false)
$$;

create function access.readable_subject_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select s.id from catalog.subjects s
  where (select access.is_admin())
     or (s.visibility = 'public' and (select auth.uid()) is not null)
     or exists (select 1 from access.subject_members m where m.subject_id = s.id and m.user_id = (select auth.uid()))
$$;

create function access.can_read_subject(sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select sid in (select access.readable_subject_ids())
$$;

create function access.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into access.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create function access.guard_is_admin_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.is_admin is distinct from old.is_admin or new.ai_limit is distinct from old.ai_limit)
     and auth.role() is distinct from 'service_role'
     and not access.is_admin() then
    raise exception 'is_admin / ai_limit 은 변경할 수 없습니다';
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function access.handle_new_user();
create trigger profiles_guard_is_admin before update on access.profiles for each row execute function access.guard_is_admin_change();

-- ---------------------------------------------------------------
-- 5. catalog 함수
-- ---------------------------------------------------------------
create function catalog.can_read_collection(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from catalog.collections c
    where c.id = cid
      and c.subject_id in (select access.readable_subject_ids())
      and (c.scope = 'shared' or c.created_by = (select auth.uid()))
  )
$$;

create function catalog.can_edit_collection(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select access.is_admin())
    or exists (select 1 from catalog.collections c where c.id = cid and c.created_by = (select auth.uid()))
$$;

create function catalog.unit_subtree(root_ids uuid[])
returns setof uuid language sql stable set search_path = '' as $$
  with recursive t as (
    select id from catalog.units where id = any(root_ids)
    union
    select u.id from catalog.units u join t on u.parent_id = t.id
  )
  select id from t
$$;

create function catalog.question_counts_by_unit(p_subject uuid)
returns table (unit_id uuid, n bigint) language sql stable set search_path = '' as $$
  select unit_id, count(*) from catalog.questions where subject_id = p_subject group by unit_id
$$;

-- 단원 분류: 단원 제목(가중 3) 과 자료 본문(가중 1) 의 접두 매칭. 자료는 knowledge 를 읽는다 (읽기 모델)
create function catalog.classify_unit(p_subject uuid, p_tokens text[])
returns table (unit_id uuid, score numeric) language sql stable set search_path = '' as $$
  with toks as (
    select distinct t from unnest(p_tokens) as t
    where length(t) >= 2 and t ~ '^[[:alnum:]가-힣]+$'
  ),
  hits as (
    select t.t, u.id as unit_id, 3.0::numeric as w
    from toks t
    join catalog.units u on u.subject_id = p_subject
      and to_tsvector('simple', u.title) @@ to_tsquery('simple', t.t || ':*')
    union all
    select t.t, s.unit_id, 1.0::numeric
    from toks t
    join knowledge.sources s on s.subject_id = p_subject and s.unit_id is not null
      and s.tsv @@ to_tsquery('simple', t.t || ':*')
  ),
  df as (select t, count(distinct unit_id) as n from hits group by t)
  select h.unit_id, sum(h.w / df.n)::numeric as score
  from hits h join df on df.t = h.t
  group by h.unit_id
  order by score desc
  limit 5
$$;

-- ---------------------------------------------------------------
-- 6. learning 함수 (읽기 모델: catalog.questions 를 읽는다)
-- ---------------------------------------------------------------
create function learning.question_stats(p_subject uuid)
returns table (
  question_id uuid, unit_id uuid, set_id uuid, tags text[], topic text, difficulty text, trap_types text[],
  attempt_count integer, wrong_count integer, last_correct boolean, last_graded_at timestamptz,
  wrong_after boolean, confused_after boolean, saved boolean, last_weak_at timestamptz
) language sql stable set search_path = '' as $$
  with q as (select id, unit_id, set_id, tags, topic, difficulty, trap_types from catalog.questions where subject_id = p_subject),
  d as (select m.question_id, m.at from learning.marks m join q on q.id = m.question_id where m.user_id = (select auth.uid()) and m.kind = 'dismissed'),
  sv as (select m.question_id, m.at from learning.marks m join q on q.id = m.question_id where m.user_id = (select auth.uid()) and m.kind = 'saved'),
  a as (select a.* from learning.attempts a join q on q.id = a.question_id where a.user_id = (select auth.uid())),
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

create function learning.unsolved_questions(p_subject uuid)
returns table (id uuid, unit_id uuid, set_id uuid, tags text[]) language sql stable set search_path = '' as $$
  select q.id, q.unit_id, q.set_id, q.tags
  from catalog.questions q
  where q.subject_id = p_subject
    and not exists (select 1 from learning.attempts a where a.user_id = (select auth.uid()) and a.question_id = q.id and a.selected_ord is not null)
$$;

create function learning.unit_progress(p_subject uuid)
returns table (session_id uuid, unit_id uuid, covered bigint, answered bigint) language sql stable set search_path = '' as $$
  with s as (
    select id, question_ids, answers from learning.quiz_sessions
    where user_id = (select auth.uid()) and subject_id = p_subject and finished = false
  ),
  sq as (
    select s.id as session_id, q.unit_id, (s.answers -> q.id::text ->> 'selectedOrd') is not null as answered
    from s cross join unnest(s.question_ids) as u(qid)
    join catalog.questions q on q.id = u.qid
  )
  select session_id, unit_id, count(*), count(*) filter (where answered) from sq group by session_id, unit_id
$$;

-- 문항별 "몇 번 풀었나" 분포 (옛 my_unit_rounds). 회독 점수는 unit_round_scores
create function learning.unit_attempt_counts(p_subject uuid)
returns table (unit_id uuid, attempts integer, n bigint, n_correct bigint) language sql stable set search_path = '' as $$
  with q as (select id, unit_id from catalog.questions where subject_id = p_subject),
  c as (
    select q.unit_id, q.id,
           count(a.id) filter (where a.selected_ord is not null) as cnt,
           (array_agg(a.is_correct order by a.created_at desc) filter (where a.selected_ord is not null))[1] as latest_correct
    from q left join learning.attempts a on a.question_id = q.id and a.user_id = (select auth.uid())
    group by q.unit_id, q.id
  )
  select c.unit_id, c.cnt::int, count(*), count(*) filter (where c.latest_correct) from c group by c.unit_id, c.cnt
$$;

-- k회독 점수: 각 문항의 k번째 채점 풀이만 모아 단원별 정답률
create function learning.unit_round_scores(p_subject uuid)
returns table (unit_id uuid, round_no integer, n bigint, n_correct bigint) language sql stable set search_path = '' as $$
  with q as (select id, unit_id from catalog.questions where subject_id = p_subject),
  a as (
    select q.unit_id, a.is_correct, row_number() over (partition by a.question_id order by a.created_at, a.id) as rn
    from q join learning.attempts a on a.question_id = q.id and a.user_id = (select auth.uid())
    where a.selected_ord is not null
  )
  select a.unit_id, a.rn::int, count(*), count(*) filter (where a.is_correct) from a group by a.unit_id, a.rn
$$;

create function learning.subject_activity()
returns table (subject_id uuid, weak_count bigint, attempt_count bigint, last_at timestamptz) language sql stable set search_path = '' as $$
  with a as (
    select q.subject_id,
      count(*) filter (where at.is_correct = false or at.confused) as weak_count,
      count(*) as attempt_count, max(at.created_at) as last_at
    from learning.attempts at join catalog.questions q on q.id = at.question_id
    where at.user_id = (select auth.uid())
    group by q.subject_id
  ),
  m as (
    select q.subject_id, count(*) as saved_count, max(mk.at) as last_at
    from learning.marks mk join catalog.questions q on q.id = mk.question_id
    where mk.user_id = (select auth.uid()) and mk.kind = 'saved'
    group by q.subject_id
  )
  select coalesce(a.subject_id, m.subject_id), coalesce(a.weak_count, 0) + coalesce(m.saved_count, 0), coalesce(a.attempt_count, 0), greatest(a.last_at, m.last_at)
  from a full join m on m.subject_id = a.subject_id
$$;

-- ---------------------------------------------------------------
-- 7. knowledge 함수
-- ---------------------------------------------------------------
create function knowledge.search_chunks(p_subject uuid, p_tokens text[], p_unit_ids uuid[] default null, p_limit int default 8)
returns table (chunk_id uuid, source_id uuid, unit_id uuid, page int, ord int, heading text, content text, kind text, source_title text, source_url text, unit_no int, score real)
language sql stable set search_path = '' as $$
  with toks as (
    select distinct t from unnest(p_tokens) as t where length(t) >= 2 and t ~ '^[[:alnum:]가-힣]+$'
  ),
  q as (select to_tsquery('simple', string_agg(t || ':*', ' | ')) as tsq from toks)
  select c.id, c.source_id, c.unit_id, c.page, c.ord, c.heading, c.content, s.kind, s.title, s.url, u.no, ts_rank_cd(c.tsv, q.tsq) as score
  from knowledge.chunks c
  join q on true
  join knowledge.sources s on s.id = c.source_id
  left join catalog.units u on u.id = c.unit_id
  where c.subject_id = p_subject
    and (p_unit_ids is null or c.unit_id = any(p_unit_ids))
    and c.tsv @@ q.tsq
  order by score desc
  limit p_limit
$$;

create function knowledge.match_chunks(
  p_subject uuid, p_embedding extensions.vector(3072) default null, p_tokens text[] default null, p_unit_ids uuid[] default null, p_limit int default 8
)
returns table (
  chunk_id uuid, source_id uuid, unit_id uuid, page int, ord int, heading text, content text,
  kind text, source_title text, source_url text, unit_no int, score real, vec_rank int, kw_rank int
)
language sql stable
set search_path = extensions
set hnsw.ef_search = 120
set hnsw.iterative_scan = relaxed_order
as $$
  with vec as (
    select v.id, row_number() over (order by v.dist) as r
    from (
      select c.id, c.embedding::extensions.halfvec(3072) <=> p_embedding::extensions.halfvec(3072) as dist
      from knowledge.chunks c
      where p_embedding is not null and c.subject_id = p_subject and c.embedding is not null
        and (p_unit_ids is null or c.unit_id = any(p_unit_ids))
      order by c.embedding::extensions.halfvec(3072) <=> p_embedding::extensions.halfvec(3072)
      limit greatest(p_limit * 4, 20)
    ) v
  ),
  toks as (
    select distinct t from unnest(coalesce(p_tokens, '{}'::text[])) as t where length(t) >= 2 and t ~ '^[[:alnum:]가-힣]+$'
  ),
  q as (select case when count(*) > 0 then to_tsquery('simple', string_agg(t || ':*', ' | ')) end as tsq from toks),
  kw as (
    select k.id, row_number() over (order by k.rank desc) as r
    from (
      select c.id, ts_rank_cd(c.tsv, q.tsq) as rank
      from knowledge.chunks c, q
      where q.tsq is not null and c.subject_id = p_subject
        and (p_unit_ids is null or c.unit_id = any(p_unit_ids))
        and c.tsv @@ q.tsq
      order by ts_rank_cd(c.tsv, q.tsq) desc
      limit greatest(p_limit * 4, 20)
    ) k
  ),
  fused as (
    select coalesce(v.id, k.id) as id,
           (coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + k.r), 0))::real as score,
           v.r::int as vec_rank, k.r::int as kw_rank
    from vec v full outer join kw k on k.id = v.id
  )
  select c.id, c.source_id, c.unit_id, c.page, c.ord, c.heading, c.content, s.kind, s.title, s.url, u.no, f.score, f.vec_rank, f.kw_rank
  from fused f
  join knowledge.chunks c on c.id = f.id
  join knowledge.sources s on s.id = c.source_id
  left join catalog.units u on u.id = c.unit_id
  order by f.score desc, f.vec_rank nulls last, f.kw_rank nulls last
  limit p_limit
$$;

-- ---------------------------------------------------------------
-- 8. community 뷰
-- ---------------------------------------------------------------
create view community.posts_view with (security_invoker = true) as
  select p.id, p.user_id, p.kind, p.title, p.body, p.status, p.admin_reply, p.created_at, p.updated_at,
         coalesce(nullif(pr.display_name, ''), split_part(coalesce(pr.email, ''), '@', 1)) as author
  from community.posts p
  left join access.profiles pr on pr.id = p.user_id;

-- ---------------------------------------------------------------
-- 9. RLS 정책 (쿼리당 한 번 평가 패턴 유지)
-- ---------------------------------------------------------------
-- access
create policy "profiles: read own or admin" on access.profiles for select to authenticated using (id = (select auth.uid()) or (select access.is_admin()));
create policy "profiles: update own" on access.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "members: read own or admin" on access.subject_members for select to authenticated using (user_id = (select auth.uid()) or (select access.is_admin()));
create policy "members: admin write" on access.subject_members for all to authenticated using ((select access.is_admin())) with check ((select access.is_admin()));

-- catalog
create policy "subjects: read if allowed" on catalog.subjects for select to authenticated using (id in (select access.readable_subject_ids()));
create policy "subjects: admin write" on catalog.subjects for all to authenticated using ((select access.is_admin())) with check ((select access.is_admin()));
create policy "units: read" on catalog.units for select to authenticated using (subject_id in (select access.readable_subject_ids()));
create policy "units: admin write" on catalog.units for all to authenticated using ((select access.is_admin())) with check ((select access.is_admin()));
create policy "questions: read" on catalog.questions for select to authenticated using (subject_id in (select access.readable_subject_ids()));
create policy "questions: admin write" on catalog.questions for all to authenticated using ((select access.is_admin())) with check ((select access.is_admin()));
create policy "choices: read" on catalog.choices for select to authenticated using (question_id in (select q.id from catalog.questions q));
create policy "choices: admin write" on catalog.choices for all to authenticated using ((select access.is_admin())) with check ((select access.is_admin()));
create policy "sets: read" on catalog.question_sets for select to authenticated using (subject_id in (select access.readable_subject_ids()));
create policy "sets: admin write" on catalog.question_sets for all to authenticated using ((select access.is_admin())) with check ((select access.is_admin()));
create policy "collections: read" on catalog.collections for select to authenticated
  using (subject_id in (select access.readable_subject_ids()) and (scope = 'shared' or created_by = (select auth.uid())));
create policy "collections: insert" on catalog.collections for insert to authenticated
  with check (created_by = (select auth.uid()) and subject_id in (select access.readable_subject_ids()) and (scope = 'private' or (select access.is_admin())));
create policy "collections: update own or admin" on catalog.collections for update to authenticated
  using (created_by = (select auth.uid()) or (select access.is_admin())) with check (created_by = (select auth.uid()) or (select access.is_admin()));
create policy "collections: delete own or admin" on catalog.collections for delete to authenticated using (created_by = (select auth.uid()) or (select access.is_admin()));
create policy "items: read" on catalog.collection_items for select to authenticated using (catalog.can_read_collection(collection_id));
create policy "items: write" on catalog.collection_items for all to authenticated using (catalog.can_edit_collection(collection_id)) with check (catalog.can_edit_collection(collection_id));

-- learning (본인 행만)
create policy "attempts: own" on learning.attempts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "quiz_sessions: own" on learning.quiz_sessions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "marks: own" on learning.marks for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notes: own" on learning.notes for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- knowledge
create policy "sources: read" on knowledge.sources for select to authenticated using (subject_id in (select access.readable_subject_ids()));
create policy "sources: admin write" on knowledge.sources for all to authenticated using ((select access.is_admin())) with check ((select access.is_admin()));
create policy "chunks: read" on knowledge.chunks for select to authenticated using (subject_id in (select access.readable_subject_ids()));
create policy "chunks: admin write" on knowledge.chunks for all to authenticated using ((select access.is_admin())) with check ((select access.is_admin()));
create policy "files: read if allowed" on knowledge.files for select to authenticated using (subject_id in (select access.readable_subject_ids()));
create policy "files: admin write" on knowledge.files for all to authenticated using ((select access.is_admin())) with check ((select access.is_admin()));
create policy "chat_logs: own" on knowledge.chat_logs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "chat_logs: admin read" on knowledge.chat_logs for select to authenticated using ((select access.is_admin()));

-- community
create policy "posts: read" on community.posts for select to authenticated using (true);
create policy "posts: insert own" on community.posts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "posts: update own or admin" on community.posts for update to authenticated
  using (user_id = (select auth.uid()) or (select access.is_admin())) with check (user_id = (select auth.uid()) or (select access.is_admin()));
create policy "posts: delete own or admin" on community.posts for delete to authenticated using (user_id = (select auth.uid()) or (select access.is_admin()));
create policy "reports: own or admin read" on community.reports for select to authenticated using (user_id = (select auth.uid()) or (select access.is_admin()));
create policy "reports: insert own" on community.reports for insert to authenticated with check (user_id = (select auth.uid()));
create policy "reports: admin update" on community.reports for update to authenticated using ((select access.is_admin())) with check ((select access.is_admin()));

-- storage: 교재 PDF 버킷
create policy "sources bucket: read if subject allowed" on storage.objects for select to authenticated
  using (bucket_id = 'sources' and ((storage.foldername(name))[1])::uuid in (select access.readable_subject_ids()));

-- ---------------------------------------------------------------
-- 10. 권한 (이동한 객체는 기존 grant 유지, 새 함수·뷰는 명시)
-- ---------------------------------------------------------------
do $$
declare s text;
begin
  foreach s in array array['access','catalog','learning','knowledge','community'] loop
    execute format('grant all on all tables in schema %I to anon, authenticated, service_role', s);
    execute format('grant execute on all functions in schema %I to anon, authenticated, service_role', s);
  end loop;
end $$;
