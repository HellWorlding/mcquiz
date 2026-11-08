-- 자료 조각: 책은 쪽 단위, 스크립트는 문단 묶음 단위. 근거 검색·챗봇 인용에 쓴다.
create table public.source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  ord int not null,
  page int,
  content text not null,
  tsv tsvector generated always as (to_tsvector('simple', content)) stored
);
create index source_chunks_source_idx on public.source_chunks(source_id, ord);
create index source_chunks_subject_unit_idx on public.source_chunks(subject_id, unit_id);
create index source_chunks_tsv_idx on public.source_chunks using gin(tsv);

alter table public.source_chunks enable row level security;
create policy "chunks: read" on public.source_chunks
  for select to authenticated using (public.can_read_subject(subject_id));
create policy "chunks: admin write" on public.source_chunks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 키워드 접두 매칭으로 조각을 찾는다. p_unit_ids 가 있으면 그 단원 안에서만.
create or replace function public.search_chunks(
  p_subject uuid,
  p_tokens text[],
  p_unit_ids uuid[] default null,
  p_limit int default 8
)
returns table (chunk_id uuid, source_id uuid, unit_id uuid, page int, ord int, content text, kind text, source_title text, unit_no int, score real)
language sql stable as $$
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
$$;
