-- 주제별 원본 파일(예: 교재 PDF). 비공개 버킷 'sources' 에 <subject_id>/<name>.pdf 로 저장하고,
-- 읽기 권한은 주제 권한(can_read_subject)을 그대로 따른다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sources', 'sources', false, 104857600, array['application/pdf'])
on conflict (id) do nothing;

create policy "sources bucket: read if subject allowed" on storage.objects
  for select to authenticated
  using (bucket_id = 'sources' and public.can_read_subject(((storage.foldername(name))[1])::uuid));

create table public.subject_files (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null default 'book',
  title text,
  storage_path text not null,
  -- 책에 인쇄된 쪽수 + page_offset = PDF 쪽 번호
  page_offset int not null default 0,
  pages int,
  created_at timestamptz not null default now(),
  unique (subject_id, name)
);
alter table public.subject_files enable row level security;
create policy "subject_files: read if allowed" on public.subject_files
  for select to authenticated using (public.can_read_subject(subject_id));
create policy "subject_files: admin write" on public.subject_files
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
