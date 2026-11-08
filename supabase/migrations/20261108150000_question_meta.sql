-- 문항 메타: 세부 주제, 난이도, 함정 유형, 근거 문장
alter table public.questions
  add column topic text,
  add column difficulty text check (difficulty in ('easy', 'medium', 'hard', 'very_hard')),
  add column trap_types text[] not null default '{}',
  add column source_quote text;
create index questions_subject_difficulty_idx on public.questions(subject_id, difficulty);
