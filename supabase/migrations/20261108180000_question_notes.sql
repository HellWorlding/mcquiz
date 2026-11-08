-- 사용자별 문항 메모 (필기 누적)
create table public.question_notes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index question_notes_user_idx on public.question_notes(user_id, updated_at desc);
alter table public.question_notes enable row level security;
create policy "question_notes: own" on public.question_notes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
