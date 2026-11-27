# 용어사전 (Ubiquitous Language)

확정일 2026-11-29. 한국어 UI 용어와 코드 이름의 대응표. 새 이름을 만들 때는 이 표를 먼저 보고, 없는 말이면 여기에 추가한 뒤 쓴다.

원칙
- 한국어 UI 용어 1개 = 영어 코드 이름 1개. 테이블·타입·함수·MCP 도구·파일 형식 모두 같은 영어를 쓴다.
- 컨텍스트마다 같은 단어가 다른 뜻이면 **컨텍스트 접두어**로 구분한다 (예: Catalog 의 Question 과 Learning 의 QuestionStat).
- 결정 이력은 9장에 둔다. 표의 "지금 코드" 열은 전환 전 이름이며, 전환이 끝나면 지운다.

## 1. 공통 (Shared Kernel)

| 한국어 | 영어 | 뜻 | 지금 코드 | 비고 |
|---|---|---|---|---|
| 과목 | Subject | 문항·자료가 속하는 최상위 단위 | subjects, UI "주제" | UI 라벨 "주제" → "과목" |
| 단원 | Unit | 과목 안의 계층 목차(트리) | units | |
| 대단원 | TopUnit (parent_id null) | 트리 최상위 단원 | group, top_level | 코드 통일 |
| 문항 | Question | 객관식 한 개 | questions, UI "문항/문제" 혼용 | UI 라벨 "문제" → "문항" ("저장된 문항", "문항 신고") |
| 선지 | Choice | 문항의 보기 4~5개 | choices | |
| 정답 | CorrectChoice | 정답 선지 번호(ord) | correct_choice | |
| 해설 | Explanation | 문항·선지 해설 | explanation | |
| 힌트 | Hint | | hint | |
| 공개 / 제한 | public / restricted | 과목 가시성 | visibility | |
| 관리자 | Admin | | is_admin | |
| 멤버 | Member | 제한 과목을 볼 수 있는 사용자 | subject_members, UI "권한" | UI 를 "멤버"로 |

## 2. Catalog (교재) — 과목·단원·문항·묶음·반입

| 한국어 | 영어 | 뜻 | 지금 코드 | 비고 |
|---|---|---|---|---|
| 세트 | QuestionSet | 한 번에 반입된 문항 묶음 (출처 단위, 불변) | question_sets | |
| 묶음 | Collection | 사용자가 고른 문항 모음 (공용/개인) | collections, collection_items | |
| 공용 / 개인 | shared / private | 묶음 범위 | scope | |
| 반입 | Import | 파일·JSON·MCP 로 문항을 넣는 행위 | import, upload 혼용 | 문항은 반입 Import, 자료는 등록 Register(Knowledge) |
| 미리보기 | ImportPreview | 반입 전 파싱 결과 | PreviewQuestion | |
| 단원 분류 | UnitClassification | 반입 문항을 단원에 배정 | classify, unit_confidence | |
| 검토 필요 | NeedsReview | 반입 후 사람이 봐야 하는 문항 | needs_review | |
| 주제어 | Topic | 문항 메타 | topic | |
| 난이도 | Difficulty | easy/medium/hard/very_hard | difficulty | |
| 함정 유형 | TrapType | 문항 메타 | trap_types | |
| 태그 | Tag | | tags | |
| 배점 | Points | | points | |
| 근거 인용 | SourceQuote / SourcePage | 문항이 가리키는 자료 문장·쪽 | source_quote, source_page | Knowledge 와의 연결고리. 이름 유지 |
| 순위 | Priority | 시작 화면 단원 배지 1~5 | priority | |
| 문항 수 | QuestionCount | 단원·묶음별 개수 | question_counts_by_unit | |

## 3. Learning (학습) — 풀이·회독·저장함·메모

| 한국어 | 영어 | 뜻 | 지금 코드 | 비고 |
|---|---|---|---|---|
| 풀이 | Attempt | 문항 하나에 대한 한 번의 응답 | attempts | |
| 선택 | SelectedChoice | 고른 선지 ord | selected_ord | |
| 정답/오답 | correct / wrong | | is_correct | |
| 헷갈림 | Confused | 풀이 때 표시한 불확실 | attempts.confused | |
| 최근 헷갈림 | ConfusedAfter | 마지막 풀이 이후에도 헷갈림 상태 | confused_after | 뜻이 다르므로 이름 유지 |
| 소요 시간 | ElapsedSec | 문항당 초 | elapsed_sec | |
| 퀴즈 | Quiz | 한 번에 푸는 문항 열 (범위 + 순서) | resolveQuiz | |
| 범위 | QuizScope | 무엇을 풀지: set / units / collection / subject / ids | QuestionScope | Learning 소유 |
| 필터 | LearningFilter | 풀이 기록 기준 선택: wrong / repeat / confused / saved / weak / unsolved | QuizParams.mode, MCP filter | 범위(무엇)와 필터(기록 기준)를 분리 |
| 진행 중인 퀴즈 | QuizSession | 이어서 풀기 위한 진행 상태 | quiz_sessions, UI "이어서 풀기" | UI 에 "세션"이라는 말은 쓰지 않는다 |
| 회독 | Round | 같은 문항을 k번째 푼 것. k회독 점수 = k번째 풀이들의 정답률 | my_unit_round_scores(round_no) | **`my_unit_rounds` 는 Round 가 아니라 AttemptCount 집계** → 이름 바꿀 것 |
| 저장함 | SavedBox | 틀림·헷갈림·직접 저장 문항을 모아 보는 화면·개념 | /weak, WeakView, weak | 라우트 `/saved`. weak 는 WeakSpot(필터)에만 쓴다 |
| 직접 저장 | Saved (mark) | 사용자가 저장 버튼으로 표시 | question_marks.kind=saved | |
| 저장함에서 빼기 | Dismissed (mark) | 저장함 목록에서 숨김 (기록은 유지) | question_marks.kind=dismissed | "빼기"의 영어는 Dismiss 유지 |
| 약점 | WeakSpot | 저장함의 합집합 필터(틀림∪헷갈림∪직접 저장) | weak 필터, buildWeakMix | 저장함(SavedBox)과 약점(WeakSpot)을 구분해서 쓸 것 |
| 약점 섞어 풀기 | WeakMix | 약점에서 n개 뽑은 퀴즈 | weakmix | |
| 2회 이상 틀림 | RepeatWrong | wrong_count ≥ 2 | repeat | |
| 안 푼 문항 | Unsolved | 풀이 기록 없음 | unseen, unsolved 혼용 | 코드 통일: Unsolved |
| 문항 통계 | QuestionStat | 사용자×문항 집계 | my_question_stats | |
| 단원 진도 | UnitProgress | 세션별 단원 커버리지 | my_unit_progress | |
| 메모 | Note | 문항별 사용자 메모 | question_notes, UI "메모", 페이지 "필기" | UI "필기" → "메모" |
| 내보내기 | Export (SavedExport, LearningSummary) | 저장함·학습 기록 파일 | exportSavedAction, export:learning, get_learning_summary | 세 구현을 하나로 |

## 4. Knowledge (지식) — 자료·조각·검색·근거·챗봇

| 한국어 | 영어 | 뜻 | 지금 코드 | 비고 |
|---|---|---|---|---|
| 자료 | Source | 올린 문서 한 편 (스크립트·노트·책·문서) | sources | |
| 자료 종류 | SourceKind | script / note / book / doc / other | kind | doc = 웹 문서·마크다운 (추가) |
| 출처 주소 | SourceUrl | 웹 자료 원 위치 | sources.url | |
| 조각 | Chunk | 검색·인용 단위 | source_chunks | |
| 제목 경로 | Heading | 조각이 속한 마크다운 제목 경로 | heading | |
| 임베딩 | Embedding | 조각 벡터 | embedding, embedding_model | |
| 검색 | SourceSearch (hybrid / keyword) | 질의 → 조각 순위 | findEvidence, match_chunks, search_chunks | 함수 이름이 Evidence 인데 하는 일은 검색 |
| 근거 | Evidence | 특정 문항에 대해 찾은 조각 (검색 결과 + 문항 맥락) | EvidenceHit, 근거 패널 | Evidence = "문항 → 자료" 용례로 한정 |
| 원문 보기 | SourceReader | 자료를 조각 순서로 읽는 화면 | /sources/[id] | |
| 교재 파일 | SubjectFile | 쪽 범위가 있는 PDF 원본 | subject_files | 2단계에서 Source 의 첨부 파일로 통합 |
| 자료 등록 | RegisterSource | 파일 → 자료+조각+임베딩 | uploadSourcesAction, importSourceFile | "업로드"는 전송 행위, 결과는 "등록" |
| 대화 기록 | ChatLog | 챗봇 대화 1건 (한도 계산용) | ai_questions | 테이블 `chat_logs` 로 변경 |
| AI 모드 | AiMode grounded / open | 자료 있으면 자료 기반, 없으면 자유 | mode.ts | |
| AI 한도 | AiQuota | 12시간 창 사용 횟수 | quota.ts, profiles.ai_limit | |

## 5. Community (게시판)

| 한국어 | 영어 | 뜻 | 지금 코드 |
|---|---|---|---|
| 게시글 | Post (kind: bug/idea/praise/other, status: open/progress/done) | | board_posts |
| 관리자 답글 | AdminReply | | admin_reply |
| 문항 신고 | QuestionReport (kind: answer/ambiguous/typo/other, status: open/done) | | question_reports |

## 6. Integration (연결)

| 한국어 | 영어 | 뜻 | 지금 코드 |
|---|---|---|---|
| 커넥터 | McpConnector | 외부 AI 가 붙는 MCP 서버 | /api/mcp |
| 도구 | Tool | MCP 도구 | registerTools |
| 동의 | OAuthConsent | 커넥터 허용 화면 | /oauth/consent |
| 반입 형식 | ImportFormat v? | JSON 문항 형식 | parse-json, get_authoring_guide |
| 내보내기 형식 | SavedExportFormat v1 | | export.ts |

## 7. API v2 이름 규칙

- use case 이름: `<context>.<동사><명사>` — `learning.recordAttempt`, `catalog.importQuestions`, `knowledge.searchSources`, `access.grantMember`
- 서버 액션은 use case 1:1 래퍼, 파일은 컨텍스트별 `ui/actions.ts` 하나
- MCP 도구: 명사는 용어사전 영어, 동사는 list/get/search/create/update/delete/import/export. `serverInfo.version = "2.0.0"`, 도구 설명에 v2 명시, v1 도구 이름은 당분간 별칭 유지
- DB 함수: `<context>_<이름>` 접두어 (`learning_question_stats`, `knowledge_match_chunks`)
- 파일 형식: 반입 JSON 에 `format: "mcquiz-questions", version: 2` 추가, 저장함 내보내기 `version: 2`

## 8. 결정 이력

2026-11-29 아래 11건을 제안값대로 확정.

| # | 질문 | 결정 |
|---|---|---|
| A | 주제 vs 과목 | **과목**(Subject). UI 라벨 "주제" → "과목" |
| B | 문항 vs 문제 | **문항**(Question). UI "저장된 문제", "문제 신고" → "저장된 문항", "문항 신고" |
| C | 세트 이름 | 유지 **세트**(QuestionSet). 뜻은 "반입 단위" |
| D | 반입/업로드/가져오기 | 문항 = **반입 Import**, 자료 = **등록 Register**. 스크립트도 `import:questions`, `register:sources` 로 |
| E | 퀴즈 범위 소유 | **Learning** 의 QuizScope + LearningFilter 로 분리 |
| F | 세션 | 코드 **QuizSession**, UI "진행 중인 퀴즈/이어서 풀기" 유지 |
| G | 저장함 영어 | **SavedBox**, 라우트 `/saved`, `weak` 는 WeakSpot(필터)로만 |
| H | 필기 vs 메모 | **메모**(Note) 로 통일 |
| I | 자료 종류에 doc 추가 | 추가 **doc**(웹 문서·마크다운) |
| J | subject_files 통합 | 2단계에서 Source 로 통합 (파일 첨부 필드). 1단계는 이름만 SubjectFile 유지 |
| K | ai_questions 이름 | **chat_logs** 로 변경 (마이그레이션) |
