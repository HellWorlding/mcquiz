/** 외부 AI(MCP) 가 문항을 만들 때 지켜야 할 JSON 형식과 규칙 */
export const AUTHORING_GUIDE = `# mcquiz 출제 형식 안내

문항은 JSON 배열로 만든다. 한 파일(또는 import_questions 한 번)에 한 소단원이 보통이다.

각 문항:
{
  "subject": "<과목 이름, list_subjects 의 name 그대로>",
  "unit_path": ["<대단원>", "<소단원>"],   // 기존 단원이면 list_units 의 path 와 글자까지 같게. 새 소단원은 마지막 요소만 새 이름
  "no": 1,                                   // 1부터 순서대로
  "prompt": "<질문. 코드가 있으면 줄바꿈 포함 가능>",
  "topic": "<세부 주제 한 구절>",
  "difficulty": "easy" | "medium" | "hard" | "very_hard",
  "trap_types": ["scope_change", ...],       // 선택. 오답 선지에 쓴 함정 유형
  "correct_choice": 1..4(또는 5),             // 선지 ord
  "explanation": "<해설. 선지 번호를 쓰지 말 것: 선지는 화면마다 섞인다. 선지 내용을 직접 인용해서 설명>",
  "hint": null | "<한 줄 힌트>",
  "source_quote": null | "<근거 원문 문장>",
  "source_page": null | 123,
  "choices": [ { "ord": 1, "text": "..." }, { "ord": 2, "text": "..." }, { "ord": 3, "text": "..." }, { "ord": 4, "text": "..." } ]
}

규칙:
- 선지는 4개(또는 5개) 모두 같은 형식·비슷한 길이. 정답 번호는 1~4 에 고르게.
- 해설·선지 어디에도 "1번", "③" 같은 번호 참조를 쓰지 않는다 (섞이면 틀린 말이 된다).
- 같은 과목에 이미 있는 문항(search_questions 로 확인)과 질문문이 같거나 거의 같으면 내지 않는다. 같은 개념은 다른 각도(정의·비교·적용·계산)로.
- 난이도 분포는 요청이 없으면 하 1/3, 중 1/3, 상 1/3.
- 넣기 전 import_questions 를 mode="check" 로 먼저 불러 형식·중복을 확인하고, 문제 없으면 mode="commit".
`;
