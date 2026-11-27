-- 롤백: 20261129100000_ddd_schemas 를 완전히 되돌린다 (정방향의 역순). 한 트랜잭션. 데이터 이동 없음.
-- 적용 뒤에는 2026-11-29 이전 main 코드가 그대로 동작한다. 검증: 로컬에서 정방향 → 이 파일 → 옛 코드 조회·가입, 그리고 다시 정방향.
-- 실행: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollback/20261129100000_ddd_schemas_down.sql
begin;
set local check_function_bodies = off;  -- 함수끼리 서로 부르므로 생성 순서에 상관없이

-- 1. 새 스키마의 정책·트리거·뷰·함수 제거
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname in ('access','catalog','learning','knowledge','community') loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;
drop policy if exists "sources bucket: read if subject allowed" on storage.objects;
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists profiles_guard_is_admin on access.profiles;
drop view if exists community.posts_view;
drop function if exists access.is_admin(), access.readable_subject_ids(), access.can_read_subject(uuid), access.handle_new_user(), access.guard_is_admin_change();
drop function if exists catalog.can_read_collection(uuid), catalog.can_edit_collection(uuid), catalog.unit_subtree(uuid[]), catalog.question_counts_by_unit(uuid), catalog.classify_unit(uuid, text[]);
-- 정방향의 서명 그대로 (p_user 인자 포함). 서명이 다르면 if exists 가 조용히 건너뛰어 아래 drop schema learning 이 실패한다
drop function if exists learning.question_stats(uuid, uuid), learning.unsolved_questions(uuid, uuid), learning.unit_progress(uuid, uuid), learning.unit_attempt_counts(uuid, uuid), learning.unit_round_scores(uuid, uuid), learning.subject_activity(uuid), learning.effective_user(uuid);
drop function if exists knowledge.search_chunks(uuid, text[], uuid[], integer), knowledge.match_chunks(uuid, extensions.vector, text[], uuid[], integer);

-- 2. 테이블을 public 으로, 옛 이름으로
alter table access.profiles set schema public;
alter table access.subject_members set schema public;
alter table catalog.subjects set schema public;
alter table catalog.units set schema public;
alter table catalog.questions set schema public;
alter table catalog.choices set schema public;
alter table catalog.question_sets set schema public;
alter table catalog.collections set schema public;
alter table catalog.collection_items set schema public;
alter table learning.attempts set schema public;
alter table learning.quiz_sessions set schema public;
alter table learning.marks set schema public;  alter table public.marks rename to question_marks;
alter table learning.notes set schema public;  alter table public.notes rename to question_notes;
alter table knowledge.sources set schema public;
alter table knowledge.chunks set schema public; alter table public.chunks rename to source_chunks;
alter table knowledge.files set schema public;  alter table public.files rename to subject_files;
alter table knowledge.chat_logs set schema public; alter table public.chat_logs rename to ai_questions;
alter table community.posts set schema public;  alter table public.posts rename to board_posts;
alter table community.reports set schema public; alter table public.reports rename to question_reports;
drop schema access; drop schema catalog; drop schema learning; drop schema knowledge; drop schema community;

-- 정방향이 지운 전역 기본값(postgres 가 만드는 함수의 PUBLIC EXECUTE)을 되돌린다. 아래에서 다시 만드는 옛 함수가 전환 전과 같은 권한을 갖게
alter default privileges for role postgres grant execute on functions to public;

-- 3. 옛 함수 18개 (2026-11-29 정방향 적용 직전 로컬 DB 의 pg_get_functiondef 그대로)
CREATE OR REPLACE FUNCTION public.can_edit_collection(cid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_admin()
    or exists (select 1 from public.collections c where c.id = cid and c.created_by = auth.uid())
$function$;
CREATE OR REPLACE FUNCTION public.can_read_collection(cid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.collections c
    where c.id = cid
      and public.can_read_subject(c.subject_id)
      and (c.scope = 'shared' or c.created_by = auth.uid())
  )
$function$;
CREATE OR REPLACE FUNCTION public.can_read_subject(sid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select sid in (select public.readable_subject_ids())
$function$;
CREATE OR REPLACE FUNCTION public.classify_unit(p_subject uuid, p_tokens text[])
 RETURNS TABLE(unit_id uuid, score numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with toks as (
    select distinct t from unnest(p_tokens) as t
    where length(t) >= 2 and t ~ '^[[:alnum:]가-힣]+$'
  ),
  hits as (
    select t.t, u.id as unit_id, 3.0::numeric as w
    from toks t
    join public.units u on u.subject_id = p_subject
      and to_tsvector('simple', u.title) @@ to_tsquery('simple', t.t || ':*')
    union all
    select t.t, s.unit_id, 1.0::numeric
    from toks t
    join public.sources s on s.subject_id = p_subject and s.unit_id is not null
      and s.tsv @@ to_tsquery('simple', t.t || ':*')
  ),
  df as (
    select t, count(distinct unit_id) as n from hits group by t
  )
  select h.unit_id, sum(h.w / df.n)::numeric as score
  from hits h join df on df.t = h.t
  group by h.unit_id
  order by score desc
  limit 5
$function$;
CREATE OR REPLACE FUNCTION public.guard_is_admin_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (new.is_admin is distinct from old.is_admin or new.ai_limit is distinct from old.ai_limit)
     and auth.role() is distinct from 'service_role'
     and not public.is_admin() then
    raise exception 'is_admin / ai_limit 은 변경할 수 없습니다';
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$function$;
CREATE OR REPLACE FUNCTION public.match_chunks(p_subject uuid, p_embedding vector DEFAULT NULL::vector, p_tokens text[] DEFAULT NULL::text[], p_unit_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 8)
 RETURNS TABLE(chunk_id uuid, source_id uuid, unit_id uuid, page integer, ord integer, heading text, content text, kind text, source_title text, source_url text, unit_no integer, score real, vec_rank integer, kw_rank integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
 SET "hnsw.ef_search" TO '120'
 SET "hnsw.iterative_scan" TO 'relaxed_order'
AS $function$
  with vec as (
    select v.id, row_number() over (order by v.dist) as r
    from (
      select c.id, c.embedding::extensions.halfvec(3072) <=> p_embedding::extensions.halfvec(3072) as dist
      from public.source_chunks c
      where p_embedding is not null
        and c.subject_id = p_subject and c.embedding is not null
        and (p_unit_ids is null or c.unit_id = any(p_unit_ids))
      order by c.embedding::extensions.halfvec(3072) <=> p_embedding::extensions.halfvec(3072)
      limit greatest(p_limit * 4, 20)
    ) v
  ),
  toks as (
    select distinct t from unnest(coalesce(p_tokens, '{}'::text[])) as t
    where length(t) >= 2 and t ~ '^[[:alnum:]가-힣]+$'
  ),
  q as (
    select case when count(*) > 0 then to_tsquery('simple', string_agg(t || ':*', ' | ')) end as tsq from toks
  ),
  kw as (
    select k.id, row_number() over (order by k.rank desc) as r
    from (
      select c.id, ts_rank_cd(c.tsv, q.tsq) as rank
      from public.source_chunks c, q
      where q.tsq is not null
        and c.subject_id = p_subject
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
  select c.id, c.source_id, c.unit_id, c.page, c.ord, c.heading, c.content,
         s.kind, s.title, s.url, u.no, f.score, f.vec_rank, f.kw_rank
  from fused f
  join public.source_chunks c on c.id = f.id
  join public.sources s on s.id = c.source_id
  left join public.units u on u.id = c.unit_id
  order by f.score desc, f.vec_rank nulls last, f.kw_rank nulls last
  limit p_limit
$function$;
CREATE OR REPLACE FUNCTION public.my_question_stats(p_subject uuid)
 RETURNS TABLE(question_id uuid, unit_id uuid, set_id uuid, tags text[], topic text, difficulty text, trap_types text[], attempt_count integer, wrong_count integer, last_correct boolean, last_graded_at timestamp with time zone, wrong_after boolean, confused_after boolean, saved boolean, last_weak_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.my_subject_activity()
 RETURNS TABLE(subject_id uuid, weak_count bigint, attempt_count bigint, last_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.my_unit_progress(p_subject uuid)
 RETURNS TABLE(session_id uuid, unit_id uuid, covered bigint, answered bigint)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.my_unit_round_scores(p_subject uuid)
 RETURNS TABLE(unit_id uuid, round_no integer, n bigint, n_correct bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with q as (select id, unit_id from public.questions where subject_id = p_subject),
  a as (
    select q.unit_id, a.is_correct,
           row_number() over (partition by a.question_id order by a.created_at, a.id) as rn
    from q join public.attempts a on a.question_id = q.id and a.user_id = auth.uid()
    where a.selected_ord is not null
  )
  select a.unit_id, a.rn::int, count(*), count(*) filter (where a.is_correct)
  from a group by a.unit_id, a.rn
$function$;
CREATE OR REPLACE FUNCTION public.my_unit_rounds(p_subject uuid)
 RETURNS TABLE(unit_id uuid, attempts integer, n bigint, n_correct bigint)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.my_unseen_questions(p_subject uuid)
 RETURNS TABLE(id uuid, unit_id uuid, set_id uuid, tags text[])
 LANGUAGE sql
 STABLE
AS $function$
  select q.id, q.unit_id, q.set_id, q.tags
  from public.questions q
  where q.subject_id = p_subject
    and not exists (select 1 from public.attempts a where a.user_id = auth.uid() and a.question_id = q.id and a.selected_ord is not null)
$function$;
CREATE OR REPLACE FUNCTION public.question_counts_by_unit(p_subject uuid)
 RETURNS TABLE(unit_id uuid, n bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select unit_id, count(*) from public.questions where subject_id = p_subject group by unit_id
$function$;
CREATE OR REPLACE FUNCTION public.readable_subject_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id from public.subjects s
  where (select public.is_admin())
     or (s.visibility = 'public' and (select auth.uid()) is not null)
     or exists (select 1 from public.subject_members m where m.subject_id = s.id and m.user_id = (select auth.uid()))
$function$;
CREATE OR REPLACE FUNCTION public.search_chunks(p_subject uuid, p_tokens text[], p_unit_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 8)
 RETURNS TABLE(chunk_id uuid, source_id uuid, unit_id uuid, page integer, ord integer, content text, kind text, source_title text, unit_no integer, score real)
 LANGUAGE sql
 STABLE
AS $function$
  with toks as (
    select distinct t from unnest(p_tokens) as t
    where length(t) >= 2 and t ~ '^[[:alnum:]가-힣]+$'
  ),
  q as (
    select to_tsquery('simple', string_agg(t || ':*', ' | ')) as tsq from toks
  )
  select c.id, c.source_id, c.unit_id, c.page, c.ord, c.content, s.kind, s.title, u.no,
         ts_rank_cd(c.tsv, q.tsq) as score
  from public.source_chunks c
  join q on true
  join public.sources s on s.id = c.source_id
  left join public.units u on u.id = c.unit_id
  where c.subject_id = p_subject
    and (p_unit_ids is null or c.unit_id = any(p_unit_ids))
    and c.tsv @@ q.tsq
  order by score desc
  limit p_limit
$function$;
CREATE OR REPLACE FUNCTION public.unit_subtree(root_ids uuid[])
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
AS $function$
  with recursive t as (
    select id from public.units where id = any(root_ids)
    union
    select u.id from public.units u join t on u.parent_id = t.id
  )
  select id from t
$function$;

-- 4. 옛 트리거·뷰
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger profiles_guard_is_admin before update on public.profiles for each row execute function public.guard_is_admin_change();
create view public.board_posts_view as  SELECT p.id,
    p.user_id,
    p.kind,
    p.title,
    p.body,
    p.status,
    p.admin_reply,
    p.created_at,
    p.updated_at,
    COALESCE(NULLIF(pr.display_name, ''::text), split_part(COALESCE(pr.email, ''::text), '@'::text, 1)) AS author
   FROM (board_posts p
     LEFT JOIN profiles pr ON ((pr.id = p.user_id)));;

-- 4b. 옛 뷰 권한 (anon 은 게시판을 못 읽는다 — 검토 N1)
revoke all on public.board_posts_view from anon;
grant select on public.board_posts_view to authenticated;

-- 5. 옛 정책 40개 (pg_policies 그대로)
create policy "ai_questions: admin read" on public.ai_questions as PERMISSIVE for SELECT to authenticated using (( SELECT is_admin() AS is_admin));
create policy "ai_questions: own" on public.ai_questions as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "attempts: own" on public.attempts as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "board: delete own or admin" on public.board_posts as PERMISSIVE for DELETE to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));
create policy "board: insert own" on public.board_posts as PERMISSIVE for INSERT to authenticated with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "board: read" on public.board_posts as PERMISSIVE for SELECT to authenticated using (true);
create policy "board: update own or admin" on public.board_posts as PERMISSIVE for UPDATE to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))) with check (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));
create policy "choices: admin write" on public.choices as PERMISSIVE for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "choices: read" on public.choices as PERMISSIVE for SELECT to authenticated using ((question_id IN ( SELECT q.id
   FROM questions q)));
create policy "items: read" on public.collection_items as PERMISSIVE for SELECT to authenticated using (can_read_collection(collection_id));
create policy "items: write" on public.collection_items as PERMISSIVE for ALL to authenticated using (can_edit_collection(collection_id)) with check (can_edit_collection(collection_id));
create policy "collections: delete own or admin" on public.collections as PERMISSIVE for DELETE to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));
create policy "collections: insert" on public.collections as PERMISSIVE for INSERT to authenticated with check (((created_by = ( SELECT auth.uid() AS uid)) AND (subject_id IN ( SELECT readable_subject_ids() AS readable_subject_ids)) AND ((scope = 'private'::text) OR ( SELECT is_admin() AS is_admin))));
create policy "collections: read" on public.collections as PERMISSIVE for SELECT to authenticated using (((subject_id IN ( SELECT readable_subject_ids() AS readable_subject_ids)) AND ((scope = 'shared'::text) OR (created_by = ( SELECT auth.uid() AS uid)))));
create policy "collections: update own or admin" on public.collections as PERMISSIVE for UPDATE to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))) with check (((created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));
create policy "sources bucket: read if subject allowed" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'sources'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT readable_subject_ids() AS readable_subject_ids))));
create policy "profiles: read own or admin" on public.profiles as PERMISSIVE for SELECT to authenticated using (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));
create policy "profiles: update own" on public.profiles as PERMISSIVE for UPDATE to authenticated using ((id = ( SELECT auth.uid() AS uid))) with check ((id = ( SELECT auth.uid() AS uid)));
create policy "question_marks: own" on public.question_marks as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "question_notes: own" on public.question_notes as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "reports: admin update" on public.question_reports as PERMISSIVE for UPDATE to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "reports: insert own" on public.question_reports as PERMISSIVE for INSERT to authenticated with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "reports: own or admin read" on public.question_reports as PERMISSIVE for SELECT to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));
create policy "sets: admin write" on public.question_sets as PERMISSIVE for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "sets: read" on public.question_sets as PERMISSIVE for SELECT to authenticated using ((subject_id IN ( SELECT readable_subject_ids() AS readable_subject_ids)));
create policy "questions: admin write" on public.questions as PERMISSIVE for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "questions: read" on public.questions as PERMISSIVE for SELECT to authenticated using ((subject_id IN ( SELECT readable_subject_ids() AS readable_subject_ids)));
create policy "quiz_sessions: own" on public.quiz_sessions as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "chunks: admin write" on public.source_chunks as PERMISSIVE for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "chunks: read" on public.source_chunks as PERMISSIVE for SELECT to authenticated using ((subject_id IN ( SELECT readable_subject_ids() AS readable_subject_ids)));
create policy "sources: admin write" on public.sources as PERMISSIVE for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "sources: read" on public.sources as PERMISSIVE for SELECT to authenticated using ((subject_id IN ( SELECT readable_subject_ids() AS readable_subject_ids)));
create policy "subject_files: admin write" on public.subject_files as PERMISSIVE for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "subject_files: read if allowed" on public.subject_files as PERMISSIVE for SELECT to authenticated using ((subject_id IN ( SELECT readable_subject_ids() AS readable_subject_ids)));
create policy "members: admin write" on public.subject_members as PERMISSIVE for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "members: read own or admin" on public.subject_members as PERMISSIVE for SELECT to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));
create policy "subjects: admin write" on public.subjects as PERMISSIVE for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "subjects: read if allowed" on public.subjects as PERMISSIVE for SELECT to authenticated using ((id IN ( SELECT readable_subject_ids() AS readable_subject_ids)));
create policy "units: admin write" on public.units as PERMISSIVE for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "units: read" on public.units as PERMISSIVE for SELECT to authenticated using ((subject_id IN ( SELECT readable_subject_ids() AS readable_subject_ids)));

-- 6. 마이그레이션 이력에서 이 버전을 지운다 (main 코드로 db push 할 때 불일치 방지)
delete from supabase_migrations.schema_migrations where version = '20261129100000';

commit;
