-- 퀴즈 진행 상태 저장 (이어서 풀기)
create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  title text not null default '퀴즈',
  question_ids uuid[] not null,
  position int not null default 0,
  answers jsonb not null default '{}'::jsonb,
  finished boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quiz_sessions_user_idx on public.quiz_sessions(user_id, finished, updated_at desc);

alter table public.quiz_sessions enable row level security;
create policy "quiz_sessions: own" on public.quiz_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
