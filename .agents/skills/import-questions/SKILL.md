---
name: import-questions
description: 문항 반입 절차 (mcquiz). 외부 AI 가 만든 JSON/텍스트 문항을 과목·단원에 넣는다. 과목 확인 → 형식 검사(check) → 중복 확인 → commit → 개수 보고. "문제 넣어줘", "반입", "JSON 문항" 요청에 사용.
---
1. 과목 이름을 `docs/glossary.md`/DB 과목 목록과 대조. 없으면 캡틴에게 "새 과목 만들까" 결정.
2. 파일은 `content/questions/<과목폴더>/` 에 보관(git 제외). 원본은 지우지 않는다.
3. 형식: `{format:"mcquiz-questions", version:2, questions:[{unit_path:[…], prompt, choices:[{text, explanation?}], correct_choice(1부터), explanation?, hint?, topic?, difficulty?, trap_types?, tags?, source_quote?, source_page?}]}`. version 없는 입력은 v1 로 읽는다. 정답 없는 문항은 거부.
4. `npm run import:questions -- <파일> --subject "<과목>"` (또는 MCP import_questions mode=check → commit). check 결과의 problems·duplicates 를 먼저 보고. 중복은 같은 단원이면 덮어쓰기.
5. 보고: 과목, 단원 경로별 개수, 건너뛴 문항과 이유, 과목 총 문항 수.
6. 교직실무 등 제한 과목 내용은 보고서에 인용하지 않는다(저장소 위생 규칙).
