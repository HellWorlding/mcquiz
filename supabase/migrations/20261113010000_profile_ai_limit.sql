-- 계정별 AI 질문 한도. null 이면 역할 기본값(관리자/일반)을 쓴다.
alter table public.profiles add column if not exists ai_limit int check (ai_limit is null or ai_limit between 0 and 100000);
comment on column public.profiles.ai_limit is 'AI 질문 한도(12시간 창). null = 역할 기본값';

-- 일반 사용자가 자기 is_admin / ai_limit 을 바꾸지 못하게 막는다
create or replace function public.guard_is_admin_change()
returns trigger language plpgsql as $$
begin
  if (new.is_admin is distinct from old.is_admin or new.ai_limit is distinct from old.ai_limit)
     and auth.role() is distinct from 'service_role'
     and not public.is_admin() then
    raise exception 'is_admin / ai_limit 은 변경할 수 없습니다';
  end if;
  return new;
end $$;
