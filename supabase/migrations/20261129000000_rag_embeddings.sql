-- RAG: 자료 조각(source_chunks)에 임베딩을 붙이고, 벡터 + 키워드 하이브리드 검색 RPC 를 만든다.
-- 임베딩 모델은 코드(EMBEDDING_MODEL, 기본 text-embedding-3-large, 3072차원)에서 정하고 조각마다 어떤 모델로 만들었는지 기록한다.
-- 3072차원은 vector 인덱스 한도(2000)를 넘으므로 halfvec 로 캐스팅한 식 인덱스(HNSW, cosine)를 쓴다.

create extension if not exists vector with schema extensions;

-- 웹 자료의 출처 주소 (인용·원문 보기용)
alter table public.sources add column if not exists url text;

alter table public.source_chunks
  add column if not exists heading text,                      -- 마크다운 제목 경로 ("Tool use > Streaming")
  add column if not exists embedding extensions.vector(3072),
  add column if not exists embedding_model text,
  add column if not exists embedded_at timestamptz;

create index if not exists source_chunks_embedding_idx on public.source_chunks
  using hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops);
-- "이 과목에 임베딩이 있나" 를 바로 알기 위한 부분 인덱스
create index if not exists source_chunks_embedded_subject_idx on public.source_chunks (subject_id) where embedding is not null;

-- 하이브리드 검색: 벡터 유사도 상위 + 키워드(tsvector) 상위를 RRF(k=60) 로 합친다.
-- p_embedding 이 null 이거나 과목에 임베딩이 없으면 키워드만으로 돈다. 권한은 호출자(RLS) 그대로.
create or replace function public.match_chunks(
  p_subject uuid,
  p_embedding extensions.vector(3072) default null,
  p_tokens text[] default null,
  p_unit_ids uuid[] default null,
  p_limit int default 8
)
returns table (
  chunk_id uuid, source_id uuid, unit_id uuid, page int, ord int, heading text, content text,
  kind text, source_title text, source_url text, unit_no int, score real, vec_rank int, kw_rank int
)
language sql stable
set search_path = public, extensions
set hnsw.ef_search = 120
set hnsw.iterative_scan = relaxed_order
-- 작은 표에서는 플래너가 순차 스캔(정확 계산)을 고르고 커지면 HNSW 로 넘어간다. enable_seqscan 등을 끄지 않는다 (강제하면 근사 검색이 작은 과목에서 빠뜨릴 수 있다).
as $$
  with vec as (
    select v.id, row_number() over (order by v.dist) as r
    from (
      select c.id, c.embedding::extensions.halfvec(3072) <=> p_embedding::extensions.halfvec(3072) as dist
      from public.source_chunks c
      where p_embedding is not null
        and c.subject_id = p_subject and c.embedding is not null
        and (p_unit_ids is null or c.unit_id = any(p_unit_ids))
      order by c.embedding::extensions.halfvec(3072) <=> p_embedding::extensions.halfvec(3072)
      limit greatest(p_limit * 4, 20)
    ) v
  ),
  toks as (
    select distinct t from unnest(coalesce(p_tokens, '{}'::text[])) as t
    where length(t) >= 2 and t ~ '^[[:alnum:]가-힣]+$'
  ),
  q as (
    select case when count(*) > 0 then to_tsquery('simple', string_agg(t || ':*', ' | ')) end as tsq from toks
  ),
  kw as (
    select k.id, row_number() over (order by k.rank desc) as r
    from (
      select c.id, ts_rank_cd(c.tsv, q.tsq) as rank
      from public.source_chunks c, q
      where q.tsq is not null
        and c.subject_id = p_subject
        and (p_unit_ids is null or c.unit_id = any(p_unit_ids))
        and c.tsv @@ q.tsq
      order by ts_rank_cd(c.tsv, q.tsq) desc
      limit greatest(p_limit * 4, 20)
    ) k
  ),
  fused as (
    select coalesce(v.id, k.id) as id,
           (coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + k.r), 0))::real as score,
           v.r::int as vec_rank, k.r::int as kw_rank
    from vec v full outer join kw k on k.id = v.id
  )
  select c.id, c.source_id, c.unit_id, c.page, c.ord, c.heading, c.content,
         s.kind, s.title, s.url, u.no, f.score, f.vec_rank, f.kw_rank
  from fused f
  join public.source_chunks c on c.id = f.id
  join public.sources s on s.id = c.source_id
  left join public.units u on u.id = c.unit_id
  order by f.score desc, f.vec_rank nulls last, f.kw_rank nulls last
  limit p_limit
$$;
grant execute on function public.match_chunks(uuid, extensions.vector, text[], uuid[], int) to authenticated;
