-- 게시판과 문제 신고
create table public.board_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'idea' check (kind in ('bug', 'idea', 'praise', 'other')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'progress', 'done')),
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index board_posts_created_idx on public.board_posts(created_at desc);
create index board_posts_user_time_idx on public.board_posts(user_id, created_at desc);

create table public.question_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  kind text not null default 'answer' check (kind in ('answer', 'ambiguous', 'typo', 'other')),
  message text not null check (char_length(message) between 1 and 100),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);
create index question_reports_user_time_idx on public.question_reports(user_id, created_at desc);
create index question_reports_status_idx on public.question_reports(status, created_at desc);

alter table public.board_posts enable row level security;
alter table public.question_reports enable row level security;

-- 게시판: 로그인한 모두 읽기, 본인 쓰기·수정·삭제, 관리자 전체
create policy "board: read" on public.board_posts for select to authenticated using (true);
create policy "board: insert own" on public.board_posts for insert to authenticated with check (user_id = auth.uid());
create policy "board: update own or admin" on public.board_posts for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "board: delete own or admin" on public.board_posts for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- 신고: 본인 것 읽기·쓰기, 관리자 전체
create policy "reports: own or admin read" on public.question_reports for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "reports: insert own" on public.question_reports for insert to authenticated with check (user_id = auth.uid());
create policy "reports: admin update" on public.question_reports for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 글쓴이 표시 이름을 함께 보여 주기 위한 뷰 (이메일은 노출하지 않음). 로그인 사용자만 읽는다.
create or replace view public.board_posts_view as
  select p.id, p.user_id, p.kind, p.title, p.body, p.status, p.admin_reply, p.created_at, p.updated_at,
    coalesce(nullif(pr.display_name, ''), split_part(coalesce(pr.email, ''), '@', 1)) as author
  from public.board_posts p left join public.profiles pr on pr.id = p.user_id;
revoke all on public.board_posts_view from anon;
grant select on public.board_posts_view to authenticated;
