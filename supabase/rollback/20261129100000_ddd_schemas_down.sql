-- 롤백: 20261129100000_ddd_schemas 를 되돌린다 (테이블·함수를 public 으로, 옛 이름으로). 데이터 이동 없음.
-- 적용 뒤에는 옛 코드(2026-11-29 이전 main) 가 다시 동작한다. 정책·함수는 20261128000000_rls_perf 상태로 재생성해야 하므로
-- 이 파일은 "테이블 복귀" 까지만 하고, 함수·정책은 옛 마이그레이션 파일(init ~ rls_perf, rag_embeddings) 의 해당 부분을 다시 실행한다.
begin;
drop view if exists community.posts_view;
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
-- 함수·정책·트리거: 옛 정의로 다시 만들 것 (migrations/20261108000000_init.sql 의 함수·정책, 20261128000000_rls_perf.sql, 20261129000000_rag_embeddings.sql 의 match_chunks)
commit;
