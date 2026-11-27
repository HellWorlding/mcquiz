-- RLS 성능: 정책 안의 함수 호출을 행마다 하지 않고 쿼리당 한 번만 평가되게 바꾼다.
-- 측정(원격, 사용자 권한): select count(*) from questions 1.19초, choices 2.99초 → 행마다 can_read_subject()/is_admin() 이 돌았기 때문.
-- 원칙: auth.uid() 와 is_admin() 은 (select …) 로 감싸 InitPlan 으로 한 번만, 과목 권한은 "subject_id in (select readable_subject_ids())" 로 해시 서브플랜 한 번만.
-- 정책 이름과 의미는 그대로다 (권한 결과는 바뀌지 않는다).

-- 내가 읽을 수 있는 과목 id 집합 (관리자 = 전체, 공개 과목, 멤버로 등록된 과목)
create or replace function public.readable_subject_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from public.subjects s
  where (select public.is_admin())
     or (s.visibility = 'public' and (select auth.uid()) is not null)
     or exists (select 1 from public.subject_members m where m.subject_id = s.id and m.user_id = (select auth.uid()))
$$;
grant execute on function public.readable_subject_ids() to authenticated;

-- 기존 함수도 같은 집합을 쓰도록 (RPC 나 다른 SQL 에서 부를 때 의미 동일)
create or replace function public.can_read_subject(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sid in (select public.readable_subject_ids())
$$;

-- ---- 과목 권한으로 읽는 표 ----
alter policy "subjects: read if allowed" on public.subjects using (id in (select public.readable_subject_ids()));
alter policy "units: read" on public.units using (subject_id in (select public.readable_subject_ids()));
alter policy "sources: read" on public.sources using (subject_id in (select public.readable_subject_ids()));
alter policy "sets: read" on public.question_sets using (subject_id in (select public.readable_subject_ids()));
alter policy "questions: read" on public.questions using (subject_id in (select public.readable_subject_ids()));
alter policy "chunks: read" on public.source_chunks using (subject_id in (select public.readable_subject_ids()));
alter policy "subject_files: read if allowed" on public.subject_files using (subject_id in (select public.readable_subject_ids()));
-- 선지: 읽을 수 있는 문항의 선지. questions 쪽 정책이 이미 과목으로 걸러 주므로 한 번의 해시 서브플랜이면 된다
alter policy "choices: read" on public.choices using (question_id in (select q.id from public.questions q));
alter policy "collections: read" on public.collections
  using (subject_id in (select public.readable_subject_ids()) and (scope = 'shared' or created_by = (select auth.uid())));
alter policy "collections: insert" on public.collections
  with check (created_by = (select auth.uid()) and subject_id in (select public.readable_subject_ids()) and (scope = 'private' or (select public.is_admin())));
alter policy "sources bucket: read if subject allowed" on storage.objects
  using (bucket_id = 'sources' and ((storage.foldername(name))[1])::uuid in (select public.readable_subject_ids()));

-- ---- 관리자 쓰기 (for all 이라 select 에도 OR 로 끼어든다 → 한 번만 평가되게) ----
alter policy "subjects: admin write" on public.subjects using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "members: admin write" on public.subject_members using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "units: admin write" on public.units using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "sources: admin write" on public.sources using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "sets: admin write" on public.question_sets using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "questions: admin write" on public.questions using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "choices: admin write" on public.choices using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "chunks: admin write" on public.source_chunks using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "subject_files: admin write" on public.subject_files using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "reports: admin update" on public.question_reports using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "ai_questions: admin read" on public.ai_questions using ((select public.is_admin()));

-- ---- 본인 행 (auth.uid() 를 한 번만) ----
alter policy "attempts: own" on public.attempts using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "question_marks: own" on public.question_marks using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "question_notes: own" on public.question_notes using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "quiz_sessions: own" on public.quiz_sessions using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "ai_questions: own" on public.ai_questions using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "profiles: read own or admin" on public.profiles using (id = (select auth.uid()) or (select public.is_admin()));
alter policy "profiles: update own" on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy "members: read own or admin" on public.subject_members using (user_id = (select auth.uid()) or (select public.is_admin()));
alter policy "collections: update own or admin" on public.collections
  using (created_by = (select auth.uid()) or (select public.is_admin())) with check (created_by = (select auth.uid()) or (select public.is_admin()));
alter policy "collections: delete own or admin" on public.collections using (created_by = (select auth.uid()) or (select public.is_admin()));
alter policy "board: insert own" on public.board_posts with check (user_id = (select auth.uid()));
alter policy "board: update own or admin" on public.board_posts
  using (user_id = (select auth.uid()) or (select public.is_admin())) with check (user_id = (select auth.uid()) or (select public.is_admin()));
alter policy "board: delete own or admin" on public.board_posts using (user_id = (select auth.uid()) or (select public.is_admin()));
alter policy "reports: own or admin read" on public.question_reports using (user_id = (select auth.uid()) or (select public.is_admin()));
alter policy "reports: insert own" on public.question_reports with check (user_id = (select auth.uid()));
