-- mcquiz 초기 스키마 + RLS
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

-- 일반 사용자가 자기 is_admin 을 올리지 못하게 막는다
create or replace function public.guard_is_admin_change()
returns trigger language plpgsql as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.role() is distinct from 'service_role'
     and not public.is_admin() then
    raise exception 'is_admin 은 변경할 수 없습니다';
  end if;
  return new;
end $$;

create trigger profiles_guard_is_admin
  before update on public.profiles
  for each row execute function public.guard_is_admin_change();

-- ---------------------------------------------------------------
-- subjects / members
-- ---------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  visibility text not null default 'public' check (visibility in ('public', 'restricted')),
  created_at timestamptz not null default now()
);

create table public.subject_members (
  subject_id uuid not null references public.subjects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subject_id, user_id)
);

create or replace function public.can_read_subject(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.subjects s
      where s.id = sid and s.visibility = 'public' and auth.uid() is not null
    )
    or exists (
      select 1 from public.subject_members m
      where m.subject_id = sid and m.user_id = auth.uid()
    )
$$;

-- ---------------------------------------------------------------
-- units (트리) / collections (트리)
-- ---------------------------------------------------------------
create table public.units (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  parent_id uuid references public.units(id) on delete cascade,
  no int,
  title text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index units_subject_idx on public.units(subject_id, parent_id, sort);
create unique index units_subject_parent_no_uq
  on public.units (subject_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), no)
  where no is not null;

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  parent_id uuid references public.collections(id) on delete cascade,
  title text not null,
  sort int not null default 0,
  scope text not null default 'private' check (scope in ('shared', 'private')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index collections_subject_idx on public.collections(subject_id, parent_id, sort);

-- ---------------------------------------------------------------
-- sources / question_sets / questions / choices
-- ---------------------------------------------------------------
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  kind text not null default 'script' check (kind in ('script', 'note', 'book', 'other')),
  title text not null,
  content text not null,
  page_range text,
  created_at timestamptz not null default now(),
  tsv tsvector generated always as (to_tsvector('simple', content)) stored
);
create index sources_subject_unit_idx on public.sources(subject_id, unit_id);
create index sources_tsv_idx on public.sources using gin(tsv);

create table public.question_sets (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  source_filename text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index question_sets_subject_idx on public.question_sets(subject_id);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.question_sets(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  unit_confidence numeric,
  ord int not null default 0,
  prompt text not null,
  choice_count int not null default 4 check (choice_count in (4, 5)),
  correct_choice int,
  hint text,
  tags text[] not null default '{}',
  points numeric,
  needs_review boolean not null default false,
  created_at timestamptz not null default now()
);
create index questions_set_idx on public.questions(set_id, ord);
create index questions_subject_unit_idx on public.questions(subject_id, unit_id);

create table public.choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  ord int not null,
  text text not null,
  explanation text,
  unique (question_id, ord)
);

create table public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, question_id)
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_ord int,
  is_correct boolean,
  confused boolean not null default false,
  created_at timestamptz not null default now()
);
create index attempts_user_idx on public.attempts(user_id, question_id, created_at desc);

-- ---------------------------------------------------------------
-- 헬퍼: 묶음 편집 가능 여부 / 단원 하위 트리 / 단원 자동 분류
-- ---------------------------------------------------------------
create or replace function public.can_edit_collection(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (select 1 from public.collections c where c.id = cid and c.created_by = auth.uid())
$$;

create or replace function public.can_read_collection(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.collections c
    where c.id = cid
      and public.can_read_subject(c.subject_id)
      and (c.scope = 'shared' or c.created_by = auth.uid())
  )
$$;

-- 주어진 단원들과 그 하위 단원 id 전체
create or replace function public.unit_subtree(root_ids uuid[])
returns setof uuid language sql stable as $$
  with recursive t as (
    select id from public.units where id = any(root_ids)
    union
    select u.id from public.units u join t on u.parent_id = t.id
  )
  select id from t
$$;

-- 키워드(접두 매칭) 기반 단원 분류. 토큰마다 1/문서빈도 가중치(IDF 비슷하게).
create or replace function public.classify_unit(p_subject uuid, p_tokens text[])
returns table (unit_id uuid, score numeric) language sql stable as $$
  with toks as (
    select distinct t from unnest(p_tokens) as t
    where length(t) >= 2 and t ~ '^[[:alnum:]가-힣]+$'
  ),
  hits as (
    select t.t, u.id as unit_id, 3.0::numeric as w
    from toks t
    join public.units u on u.subject_id = p_subject
      and to_tsvector('simple', u.title) @@ to_tsquery('simple', t.t || ':*')
    union all
    select t.t, s.unit_id, 1.0::numeric
    from toks t
    join public.sources s on s.subject_id = p_subject and s.unit_id is not null
      and s.tsv @@ to_tsquery('simple', t.t || ':*')
  ),
  df as (
    select t, count(distinct unit_id) as n from hits group by t
  )
  select h.unit_id, sum(h.w / df.n)::numeric as score
  from hits h join df on df.t = h.t
  group by h.unit_id
  order by score desc
  limit 5
$$;

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.subject_members enable row level security;
alter table public.units enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.sources enable row level security;
alter table public.question_sets enable row level security;
alter table public.questions enable row level security;
alter table public.choices enable row level security;
alter table public.attempts enable row level security;

-- profiles
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- subjects
create policy "subjects: read if allowed" on public.subjects
  for select to authenticated using (public.can_read_subject(id));
create policy "subjects: admin write" on public.subjects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- subject_members
create policy "members: read own or admin" on public.subject_members
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "members: admin write" on public.subject_members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- units
create policy "units: read" on public.units
  for select to authenticated using (public.can_read_subject(subject_id));
create policy "units: admin write" on public.units
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- sources
create policy "sources: read" on public.sources
  for select to authenticated using (public.can_read_subject(subject_id));
create policy "sources: admin write" on public.sources
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- question_sets
create policy "sets: read" on public.question_sets
  for select to authenticated using (public.can_read_subject(subject_id));
create policy "sets: admin write" on public.question_sets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- questions
create policy "questions: read" on public.questions
  for select to authenticated using (public.can_read_subject(subject_id));
create policy "questions: admin write" on public.questions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- choices (questions 를 통해 권한 판단)
create policy "choices: read" on public.choices
  for select to authenticated using (
    exists (select 1 from public.questions q where q.id = question_id and public.can_read_subject(q.subject_id))
  );
create policy "choices: admin write" on public.choices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- collections
create policy "collections: read" on public.collections
  for select to authenticated using (
    public.can_read_subject(subject_id) and (scope = 'shared' or created_by = auth.uid())
  );
create policy "collections: insert" on public.collections
  for insert to authenticated with check (
    created_by = auth.uid()
    and public.can_read_subject(subject_id)
    and (scope = 'private' or public.is_admin())
  );
create policy "collections: update own or admin" on public.collections
  for update to authenticated using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
create policy "collections: delete own or admin" on public.collections
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());

-- collection_items
create policy "items: read" on public.collection_items
  for select to authenticated using (public.can_read_collection(collection_id));
create policy "items: write" on public.collection_items
  for all to authenticated using (public.can_edit_collection(collection_id))
  with check (public.can_edit_collection(collection_id));

-- attempts: 본인 것만
create policy "attempts: own" on public.attempts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
