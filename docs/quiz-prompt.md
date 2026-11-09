# 퀴즈 생성 프롬프트

ChatGPT·Claude 등에 아래 프롬프트와 자료(강의 스크립트, 정리 노트 등)를 함께 주면 mcquiz 가 바로 읽는 형식으로 문제가 나옵니다.
결과를 `.txt` 로 저장해 `/admin/upload` 에 올리거나, 텍스트를 그대로 붙여 넣으면 됩니다.

`[N강]` 머리글이 있으면 그 단원에 자동 배정됩니다. 단원 번호를 모르면 머리글을 빼도 됩니다(키워드로 자동 분류).

---

```
아래 자료를 바탕으로 객관식 문제를 만들어 줘. 반드시 아래 출력 형식을 지켜.

[조건]
- 문항 수: 20개
- 4지선다 (선지 4개). 필요하면 5지선다도 가능
- 자료에 실제로 나오는 내용만 출제. 자료에 없는 내용을 지어내지 말 것
- 옳지 않은 것 고르기, 옳은 것 고르기, 빈칸, 순서, 개념 연결 등 유형을 섞을 것
- 선지는 서로 길이가 비슷하게. 정답 번호는 1~4에 고르게 분포
- 해설은 선지마다 한 줄씩: 맞는 선지는 "옳음. 이유", 틀린 선지는 "틀림. 이유"
- 문항 전체를 정리하는 해설이 필요하면 정답 줄 아래 "해설: …" 한 줄을 추가 (예: 7가지 원리 전체 나열)
- 자료가 여러 강(단원)이면 문항 앞에 [N강] 제목 머리글을 넣고, 머리글 아래 문항은 그 강의 내용만 출제

[출력 형식] — 이 형식 외의 설명, 인사말, 마크다운 표는 넣지 말 것

[3강] 단원 제목

1. 질문 본문?
1) 선지
2) 선지
3) 선지
4) 선지

2. 질문 본문?
1) 선지
2) 선지
3) 선지
4) 선지

(…문항 계속…)

==================
정답 및 해설
==================

1. 정답: 2번
  1) 틀림. 이유
  2) 옳음. 이유
  3) 틀림. 이유
  4) 틀림. 이유

2. 정답: 4번
  해설: (선택) 문항 전체 정리. 예: 7가지 원리는 A, B, C, D, E, F, G 이다.
  1) 틀림. 이유
  2) 틀림. 이유
  3) 틀림. 이유
  4) 옳음. 이유
  힌트: (선택) 풀이에 도움이 되는 한 줄

(…정답 계속…)

[자료]
(여기에 강의 스크립트나 노트를 붙여넣기)
```

---

## 규칙 요약 (파서가 읽는 것)

| 요소 | 형식 |
| --- | --- |
| 문항 | `N. 질문` (줄 시작) |
| 선지 | `1) 선지` / `(1) 선지` / `① 선지` / `1 선지` 모두 가능. 4개 또는 5개 |
| 정답 | `N. 정답: k번` (정답 블록) 또는 문항 바로 아래 `정답: k` |
| 선지별 해설 | 정답 줄 아래 `  k) 해설` |
| 문항 해설 | 정답 줄 아래 `해설: …` (선지별 해설과 별도, 전체 정리용) |
| 힌트 | `힌트: …` |
| 단원 | `[N강] 제목` 머리글, 또는 문항 끝에 `[N강]` |
| 태그 | 질문 끝에 `#태그` |

정답이 없는 문항(복기 메모)도 올릴 수 있고, 미리보기에서 정답 번호를 눌러 지정하면 됩니다.

## 앱에서 각 필드가 어떻게 쓰이는지 (문제를 만들 때 참고)

| 필드 | 화면에서 쓰이는 곳 | 만들 때 지킬 것 |
| --- | --- | --- |
| `prompt` | 문제 본문. 같은 단원에 같은 `prompt`가 있으면 덮어쓰기 기준 | 줄바꿈 `\n` 가능, 보기 ㄱ~ㅂ 포함 가능. 문항마다 서로 달라야 함 |
| `unit_no` | 단원 배정, 저장함·필기의 "N강 M번" 표시, 단원별 통계 | 자료의 강 번호. 한 파일 = 한 강 권장 (`questions_N강.json`) |
| `choices[].text` | 선지. 순서를 섞어서 보여 줌 | "1번과 2번 모두" 같이 번호를 가리키는 선지 금지 (섞이면 틀어짐) |
| `choices[].explanation` | 답을 고르면 "선지별 해설"에 정답은 초록, 내가 고른 오답은 빨강 | `"옳음. 이유"` / `"틀림. 이유"`. "(정답)" 표시는 화면에서 숨겨짐 |
| `correct_choice` | 채점, 정답 선지 강조 | `choices`의 `ord` 중 하나 |
| `explanation` | 답을 고른 직후 "해설" 상자. 메모의 "해설·근거 가져오기"로 필기에 붙음 | 문항 하나만 보고도 이해되게 **자기완결적으로**. 목록형 문제는 전체 항목을 나열 |
| `source_quote`, `source_page` | "근거 · 책 p.N" 인용. 근거 찾기 검색어로도 쓰임 | 자료 문장을 **원문 그대로** 인용 (검색이 맞아떨어짐). 책이면 쪽수 |
| `topic` | 배지, 저장함 통계 "세부 주제별" | 같은 주제는 같은 표기로 (예: "직권면직" 통일) |
| `difficulty` | 배지, 시작 화면의 난이도 골라 풀기, 통계 | `hard` / `very_hard` (또는 easy/medium) |
| `points` | 배지, 결과 점수 합산 | 상 1.5, 최상 2 등 숫자 |
| `trap_types` | 답을 고른 뒤 "함정: 숫자 변경" 배지, 통계 "함정 유형별" | 아래 코드 목록에서만 |
| `hint` | "힌트 보기" 버튼 (있을 때만) | 정답을 바로 말하지 않는 한 줄 |

## 다른 주제 (예: TOEIC > Collocation > Part 1~30)

파일이나 문항에 `subject`(주제 이름)와 `unit_path`(단원 경로 배열)를 적으면 그 주제·단원으로 들어갑니다. 단원 경로의 단원이 없으면 자동으로 만들어집니다(트리). `subject`가 없으면 기본 주제 + `unit_no` 방식 그대로입니다. 같은 문항 판별은 (주제, 단원, 번호/질문) 기준이라 주제끼리 섞이지 않습니다.

```json
{
  "subject": "TOEIC",
  "unit_path": ["Collocation", "Part 3"],
  "title": "Collocation Part 3",
  "questions": [
    { "prompt": "We need to ___ a decision.", "correct_choice": 1, "explanation": "make a decision",
      "choices": [ { "ord": 1, "text": "make" }, { "ord": 2, "text": "do" }, { "ord": 3, "text": "take" }, { "ord": 4, "text": "have" } ] }
  ]
}
```

- 선지별 `explanation`은 없어도 됩니다(문항 `explanation`만 보여 줌).
- 파일명이 `toeic_collocation_part3.json`이면 `subject`/`unit_path`가 없어도 TOEIC > Collocation > Part 3으로 갑니다(`toeic_<묶음>_part<N>.json`; 묶음 코드: collocation, part5, hackers, vocab, grammar, listening, reading). 영어로 배우는 주제는 단원 이름도 영어로 적습니다(Collocation, Vocabulary, Part 3, Set 7). 예전 한글 이름(토익, 콜로케이션, 어휘, 파트3, 세트7)을 적어도 같은 단원으로 들어갑니다.
- Claude 퀴즈 형식도 그대로 됩니다: `{ "title", "questions": [ { "prompt", "options": [ { "id", "text" } ], "correct_option_id", "explanation", "hint" } ] }` → options 순서가 선지 번호가 됩니다.

## 회차를 나눠 같은 단원에 쌓기 (예: English › Listening & Speaking 2 › Unit 3)

같은 Unit 에 1차·2차를 쌓을 때는 회차별 파일을 따로 두고 `no` 를 이어서 매깁니다(1차 1~10, 2차 11~20). 같은 파일의 같은 번호는 덮어쓰고, 다른 파일은 서로 건드리지 않습니다.

```
english_ls2_unit3_r1.json  → "no": 1 ~ 10
english_ls2_unit3_r2.json  → "no": 11 ~ 20
```
각 문항: `{"subject":"English","unit_path":["Listening & Speaking 2","Unit 3"],"no":11, …}`

## 폴더째 올리기

```bash
npm run import:questions -- <폴더> --subject "<주제 이름>"
```
폴더 안의 `questions_*.json`과 `toeic*.json`을 전부 올립니다. 같은 (주제, 단원, 질문) 문항이 이미 있으면 새로 만들지 않고 덮어씁니다. 검증에 실패한 문항은 목록으로 보여 주고 나머지는 저장합니다.

## 선택 필드

| 필드 | 값 | 화면 |
| --- | --- | --- |
| `topic` | 세부 주제 문자열 | 배지, 통계(세부 주제별) |
| `difficulty` | `easy` / `medium` / `hard` / `very_hard` (하/중/상/최상) | 배지, 시작 화면에서 난이도 골라 풀기, 통계 |
| `points` | 숫자 | 저장만 |
| `trap_types` | 아래 코드 배열 | 답 고른 뒤 "함정: …" 배지, 통계(함정 유형별) |
| `source_quote` | 원문 문장 | 답 고른 뒤 "근거" 인용 |
| `source_page` | 책 쪽수(숫자) | 근거에 "책 p.N" 으로 표시 |

`trap_types` 코드: `concept_swap` 개념 바꿔치기 · `number_change` 숫자 변경 · `scope_change` 범위 변경 · `subject_change` 주체 변경 · `modality_change` 의무·재량 변경 · `partial_truth` 부분만 맞음 · `reversal` 뒤집기 · `stage_mixup` 단계 뒤섞기 · `law_article_mixup` 조문 뒤섞기 · `plausible_synonym` 그럴듯한 유사어 · `missing_add_on` 조건 누락

## JSON 으로 받고 싶을 때

프로그램으로 만들 때는 JSON 이 더 안전합니다.

```json
[
  {
    "prompt": "질문?",
    "unit_no": 3,
    "correct_choice": 2,
    "explanation": "문항 전체 해설. 예: 7가지 원리는 A·B·C·D·E·F·G 이다.",
    "hint": null,
    "topic": "세부 주제 (선택)",
    "difficulty": "hard",
    "points": 1.5,
    "trap_types": ["concept_swap", "number_change"],
    "source_quote": "정답 근거가 된 원문 문장 (선택)",
    "source_page": 5,
    "choices": [
      { "ord": 1, "text": "선지", "explanation": "틀림. 이유" },
      { "ord": 2, "text": "선지", "explanation": "옳음. 이유" },
      { "ord": 3, "text": "선지", "explanation": "틀림. 이유" },
      { "ord": 4, "text": "선지", "explanation": "틀림. 이유" }
    ]
  }
]
```
