-- 반입 봉투 (D-020, PRD-mcp-reliability §5.1 a)
-- 문항 본문의 SQL 문장·HTML 이 Supabase 앞단 WAF 에 막히지 않게, 반입 쓰기를 base64(UTF-8 JSON) 한 덩어리로 받아 DB 안에서 풀어 저장한다.
-- 판정(파싱·검증·중복 계획 planImport)은 앱(catalog application)에서 끝난 뒤다. 이 함수는 계획을 적용하는 쓰기만 한다.
--   · security invoker: 호출한 사용자의 권한·RLS 그대로 ("questions/choices/sets: admin write" 정책이 판정)
--   · 시작에 관리자 확인. service_role(로컬 CLI)은 원래 RLS 를 우회하는 역할이라 허용한다
--   · 함수 하나 = 한 트랜잭션: 하나라도 실패하면 세트·새 문항·선지·덮어쓰기가 하나도 남지 않는다
-- 새 함수만 추가한다. 기존 테이블·정책은 바꾸지 않는다.
--
-- p_payload = base64(JSON):
--   { "subject_id": uuid,
--     "set": { "id": uuid|null, "title": text, "source_filename": text|null, "created_by": uuid|null },
--     "inserts": [ { <문항 열>, "ord": int, "choices": [ { "ord": int, "text": text, "explanation": text|null } ] } ],
--     "updates": [ { "id": uuid, <문항 열>, "choices": [...] } ] }
--   <문항 열> = unit_id, unit_confidence, prompt, correct_choice, explanation, hint, tags, points, topic, difficulty,
--               trap_types, source_quote, source_page, needs_review
-- 반환: { "set_id": uuid|null, "inserted": int, "updated": int }
--   set_id: 새로 만든(또는 지정한) 세트, 새 문항이 없으면 첫 덮어쓴 문항의 세트

create function catalog.apply_import(p_payload text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v jsonb;
  v_subject uuid;
  v_set jsonb;
  v_set_id uuid;
  v_q jsonb;
  v_c jsonb;
  v_qid uuid;
  v_n int;
  v_i int;
  v_ords int[];
  v_inserted int := 0;
  v_updated int := 0;
begin
  if not ((select access.is_admin()) or current_user = 'service_role') then
    raise exception '관리자만 문항을 넣을 수 있습니다' using errcode = '42501';
  end if;

  begin
    v := convert_from(decode(p_payload, 'base64'), 'UTF8')::jsonb;
  exception when others then
    raise exception '반입 봉투를 읽지 못했습니다 (base64·UTF-8·JSON 이 아님): %', sqlerrm using errcode = '22023';
  end;

  if jsonb_typeof(v) <> 'object' or v->>'subject_id' is null then
    raise exception '반입 봉투에 subject_id 가 없습니다' using errcode = '22023';
  end if;
  v_subject := (v->>'subject_id')::uuid;
  if jsonb_typeof(coalesce(v->'inserts', '[]')) <> 'array' or jsonb_typeof(coalesce(v->'updates', '[]')) <> 'array' then
    raise exception 'inserts / updates 는 배열이어야 합니다' using errcode = '22023';
  end if;

  -- 최소 검증 (M5): 앱의 validateQuestions 를 건너뛰고 함수를 직접 부르는 호출에 대비
  v_i := 0;
  for v_q in select * from jsonb_array_elements(coalesce(v->'inserts', '[]') || coalesce(v->'updates', '[]')) loop
    v_i := v_i + 1;
    if coalesce(btrim(v_q->>'prompt'), '') = '' then
      raise exception '문항 %: 질문이 비어 있음', v_i using errcode = '22023';
    end if;
    if jsonb_typeof(v_q->'choices') is distinct from 'array' then
      raise exception '문항 %: choices 가 배열이 아님', v_i using errcode = '22023';
    end if;
    v_n := jsonb_array_length(v_q->'choices');
    if v_n not in (4, 5) then
      raise exception '문항 %: 선지가 %개 (4개 또는 5개여야 함)', v_i, v_n using errcode = '22023';
    end if;
    select array_agg((c->>'ord')::int order by (c->>'ord')::int) into v_ords from jsonb_array_elements(v_q->'choices') c;
    if v_ords is distinct from (select array_agg(g order by g) from generate_series(1, v_n) g) then
      raise exception '문항 %: 선지 ord 는 1..% 이어야 함', v_i, v_n using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_q->'choices') c where coalesce(btrim(c->>'text'), '') = '') then
      raise exception '문항 %: 빈 선지가 있음', v_i using errcode = '22023';
    end if;
    if v_q->>'correct_choice' is not null and ((v_q->>'correct_choice')::int < 1 or (v_q->>'correct_choice')::int > v_n) then
      raise exception '문항 %: 정답 번호 % 가 선지 범위를 벗어남', v_i, v_q->>'correct_choice' using errcode = '22023';
    end if;
  end loop;

  -- 세트: 지정한 세트 또는 새 문항이 있을 때만 새로 만든다
  v_set := coalesce(v->'set', '{}');
  v_set_id := nullif(v_set->>'id', '')::uuid;
  if v_set_id is null and jsonb_array_length(coalesce(v->'inserts', '[]')) > 0 then
    if coalesce(btrim(v_set->>'title'), '') = '' then
      raise exception '세트 이름이 없습니다' using errcode = '22023';
    end if;
    insert into catalog.question_sets (subject_id, title, source_filename, created_by)
    values (v_subject, v_set->>'title', v_set->>'source_filename', nullif(v_set->>'created_by', '')::uuid)
    returning id into v_set_id;
  end if;

  -- 새 문항
  for v_q in select * from jsonb_array_elements(coalesce(v->'inserts', '[]')) loop
    insert into catalog.questions (
      set_id, subject_id, unit_id, unit_confidence, ord, prompt, choice_count, correct_choice, explanation, hint,
      tags, points, topic, difficulty, trap_types, source_quote, source_page, needs_review
    ) values (
      v_set_id, v_subject, (v_q->>'unit_id')::uuid, (v_q->>'unit_confidence')::numeric, coalesce((v_q->>'ord')::int, 0),
      v_q->>'prompt', jsonb_array_length(v_q->'choices'), (v_q->>'correct_choice')::int, v_q->>'explanation', v_q->>'hint',
      coalesce(array(select jsonb_array_elements_text(coalesce(v_q->'tags', '[]'))), '{}'), (v_q->>'points')::numeric,
      v_q->>'topic', v_q->>'difficulty',
      coalesce(array(select jsonb_array_elements_text(coalesce(v_q->'trap_types', '[]'))), '{}'),
      v_q->>'source_quote', (v_q->>'source_page')::int,
      coalesce((v_q->>'needs_review')::boolean, false) or v_q->>'correct_choice' is null
    ) returning id into v_qid;
    insert into catalog.choices (question_id, ord, text, explanation)
    select v_qid, (c->>'ord')::int, c->>'text', c->>'explanation' from jsonb_array_elements(v_q->'choices') c;
    v_inserted := v_inserted + 1;
  end loop;

  -- 덮어쓰기: 질문·메타·선지를 바꾸고 세트·번호(ord)는 그대로 둔다
  for v_q in select * from jsonb_array_elements(coalesce(v->'updates', '[]')) loop
    v_qid := (v_q->>'id')::uuid;
    update catalog.questions set
      subject_id = v_subject,
      unit_id = (v_q->>'unit_id')::uuid,
      unit_confidence = (v_q->>'unit_confidence')::numeric,
      prompt = v_q->>'prompt',
      choice_count = jsonb_array_length(v_q->'choices'),
      correct_choice = (v_q->>'correct_choice')::int,
      explanation = v_q->>'explanation',
      hint = v_q->>'hint',
      tags = coalesce(array(select jsonb_array_elements_text(coalesce(v_q->'tags', '[]'))), '{}'),
      points = (v_q->>'points')::numeric,
      topic = v_q->>'topic',
      difficulty = v_q->>'difficulty',
      trap_types = coalesce(array(select jsonb_array_elements_text(coalesce(v_q->'trap_types', '[]'))), '{}'),
      source_quote = v_q->>'source_quote',
      source_page = (v_q->>'source_page')::int,
      needs_review = coalesce((v_q->>'needs_review')::boolean, false) or v_q->>'correct_choice' is null
    where id = v_qid;
    if not found then
      raise exception '덮어쓸 문항 % 을(를) 찾을 수 없습니다', v_qid using errcode = 'P0002';
    end if;
    delete from catalog.choices where question_id = v_qid;
    insert into catalog.choices (question_id, ord, text, explanation)
    select v_qid, (c->>'ord')::int, c->>'text', c->>'explanation' from jsonb_array_elements(v_q->'choices') c;
    v_updated := v_updated + 1;
    if v_set_id is null then
      select q.set_id into v_set_id from catalog.questions q where q.id = v_qid;
    end if;
  end loop;

  return jsonb_build_object('set_id', v_set_id, 'inserted', v_inserted, 'updated', v_updated);
end;
$$;

comment on function catalog.apply_import(text) is '반입 봉투(base64 JSON) 적용: 세트 생성 + 새 문항 + 덮어쓰기를 한 트랜잭션으로. 관리자(또는 service_role)만, RLS 는 호출자 권한 (D-020)';

revoke all on function catalog.apply_import(text) from public, anon;
grant execute on function catalog.apply_import(text) to authenticated, service_role;
