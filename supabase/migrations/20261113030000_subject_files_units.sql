-- 원본 PDF 를 단원별로 잘라 올릴 때: 어느 단원, 교재 쪽수 몇~몇 인지
alter table public.subject_files
  add column if not exists unit_id uuid references public.units(id) on delete set null,
  add column if not exists page_from int,
  add column if not exists page_to int;
create index if not exists subject_files_pages_idx on public.subject_files(subject_id, page_from, page_to);
