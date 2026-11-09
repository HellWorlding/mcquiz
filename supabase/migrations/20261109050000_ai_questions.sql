-- AI 질문 기록: 사용량 제한(12시간 창) + 나중에 내역 보기
create table public.ai_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  question_id uuid references public.questions(id) on delete set null,
  question text not null,
  answer text,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index ai_questions_user_time_idx on public.ai_questions(user_id, created_at desc);
alter table public.ai_questions enable row level security;
create policy "ai_questions: own" on public.ai_questions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ai_questions: admin read" on public.ai_questions
  for select to authenticated using (public.is_admin());
