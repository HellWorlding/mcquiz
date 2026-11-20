-- 문항별 소요 시간(초). 풀이 화면 스톱워치가 답을 고를 때 함께 기록한다.
-- 나중에 제한 시간(모의고사) 모드와 문항당 평균 시간 통계에 쓴다. 5분을 넘기면 300 으로 잘린다.
alter table public.attempts add column if not exists elapsed_sec int check (elapsed_sec is null or (elapsed_sec >= 0 and elapsed_sec <= 3600));
