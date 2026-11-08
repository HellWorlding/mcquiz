-- 사용자별 문항 표시: 'saved' = 직접 저장, 'dismissed' = 약점 목록에서 뺌
create table public.question_marks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  kind text not null check (kind in ('saved', 'dismissed')),
  at timestamptz not null default now(),
  primary key (user_id, question_id, kind)
);
alter table public.question_marks enable row level security;
create policy "question_marks: own" on public.question_marks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
