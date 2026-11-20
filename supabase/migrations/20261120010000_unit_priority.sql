-- 단원 우선순위(1 이 가장 중요). 시작 화면에서 단원 제목 옆에 "1순위" 처럼 표시한다. 비어 있으면 표시하지 않는다.
alter table public.units add column if not exists priority smallint check (priority is null or priority between 1 and 5);
