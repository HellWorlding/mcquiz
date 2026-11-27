# MCQuiz

[MCQuiz 웹 사이트 바로가기](https://mcquiz.site/)

객관식(4지·5지선다) 문제 파일을 올리면 바로 풀 수 있는 학습용 퀴즈 웹앱입니다. 한 문제씩 풀고 즉시 정답·해설을 확인하고, 틀린 문제와 헷갈린 문제를 모아 다시 풀며, 회독(한 바퀴) 단위로 진도와 정답률을 추적합니다. 자료(강의 스크립트·교재)가 있는 과목은 그 자료에서 근거를 찾아 보여 주고 원문 PDF의 해당 쪽을 바로 엽니다. 자료가 없는 과목은 AI 튜터가 일반 지식으로 답합니다.

- 스택: Next.js 16 (App Router, TypeScript) · Tailwind CSS v4 · Supabase (Auth, Postgres, RLS, Storage) · Vercel · OpenAI(선택)
- 규모: 과목 7개, 단원 430여 개, 문항 8,800여 개를 운영 중 (2026-11 기준)
- UI 한국어/영어 전환, 모바일 우선, PWA(홈 화면 설치) 지원

## 기능

### 퀴즈 풀기
- 시작 화면: 과목 → 단원 트리(상위를 고르면 하위 포함, 여러 개 동시 선택) / 묶음 / 세트. 문항 수 10·20·40·전체, 순서대로·무작위, 난이도, "N회 미만 푼 것만", 번호 구간 지정. 긴 단원은 "1~20번, 21~40번"으로 나눠 풀기.
- 단원마다 **회독 배지**: "1회독 16/20 80% · 2회독 19/20 95%"처럼 완료한 바퀴마다 그 바퀴의 정답률을, 진행 중이면 "3회독 중 5/20"을 보여 줍니다. 상위 단원은 하위를 합산합니다.
- 한 문제씩 즉시 채점. 선지는 섞이되 해설은 선지 객체에 붙어 함께 움직입니다(번호로 해설을 잇지 않음). 답을 고르면 문항 해설 → 선지별 해설 → 근거(교재 p.N) → 함정 유형 배지 순으로 펼쳐집니다.
- 힌트, 헷갈림 체크, 저장, 문항별 메모(자동 저장, 글자 크기 조절), 신고.
- 진행 상태가 서버에 저장되어 새로고침·다른 기기에서도 "이어서 풀기"가 됩니다.
- 결과 화면: 배점 합산 점수, 틀린/헷갈린 문항 요약(저장·AI 질문 버튼 포함), 틀린 것만 다시 풀기, 묶음에 추가.

### 외부 AI 연결 (MCP)
- `https://<배포 주소>/api/mcp` 를 Claude·ChatGPT 등의 커넥터로 등록하면, 그 AI 가 내 과목·단원·문항과 풀이 기록을 읽고(관리자는 문항을 넣기도) 합니다.
- 자료를 올린 과목은 `search_sources` 로 원자료 조각을 찾아 근거로 쓸 수 있습니다 (아래 RAG).

### 자료 검색 (RAG)
- 올린 자료(`.md/.txt/.html/.pdf`)는 조각으로 나뉘어 저장되고, OpenAI 임베딩(`text-embedding-3-large`)과 pgvector(HNSW) 로 색인됩니다. 검색은 벡터 유사도와 키워드 점수를 합친 하이브리드입니다.
- 임베딩은 과목 단위로 켭니다 (`npm run cli -- sources embed "<과목>"`). 임베딩이 없는 과목은 키워드 검색으로 동작합니다. `OPENAI_API_KEY` 가 없어도 앱은 그대로 돕니다.
- 로그인은 Supabase Auth 의 OAuth 2.1 서버로 하며, 모든 도구는 그 사용자 권한(RLS)으로 동작합니다. 계정 화면에 주소와 연결 방법이 있습니다.

### AI 튜터
- 풀이 화면 우하단의 둥근 버튼으로 **채팅 모달**이 열립니다. 문제·선지·해설이 기본 맥락으로 깔려 있어 "왜 3번이 틀려?" 같은 꼬리 질문을 바로 할 수 있고, 꼬리 질문 버튼(왜 정답인지 / 다른 보기는 왜 틀렸는지 / 비슷한 표현과 차이 / 예문 더 / 자주 틀리는 점)도 있습니다.
- **답을 고르기 전**에 열면 힌트 모드: 정답을 숨기고 AI도 정답을 직접 말하지 않고 개념·접근법으로만 돕습니다. 답을 고르면 같은 창이 정답·해설 모드로 바뀝니다.
- 다음 문제로 가면 창이 접히고 새 문제 맥락으로 시작합니다. 문항별 이전 대화는 저장되어 다시 열면 이어집니다.
- 두 가지 모드를 과목의 자료 유무로 자동 선택합니다.
  - 자료 있음(grounded): 질문과 문항으로 자료를 검색해 찾은 조각만 근거로 답하고 "[1] 40강 스크립트, [2] 책 p.292" 식으로 출처를 답니다.
  - 자료 없음(open): 일반 지식으로 답하되 핵심 규칙·예문·유사 표현과의 차이·흔한 실수 같은 파생 정보를 덧붙입니다.
- 선지 번호는 화면에 섞여 보인 순서대로 AI에게 전달되어 "3번"이 서로 어긋나지 않습니다.
- 사용량 제한(12시간 창, 역할 기본값 + 계정별 한도), 질문·답변 기록, 마크다운 기호 제거(굵게 → 따옴표) 등 운영 장치를 갖췄습니다.

### 근거 자료와 원문 보기
- 관리자가 강의 스크립트·노트·교재(txt/md/pdf)를 올리면 단원에 연결되고 검색용 조각으로 나뉩니다. 교재는 `[p.N]` 표시 기준으로 쪽 단위이며 쪽수가 보존됩니다.
- 문항마다 "근거 찾기": 그 문항의 단원 자료에서 먼저 찾고(Postgres 전문검색), 모자라면 과목 전체에서 찾습니다.
- **원문 보기**: 근거·AI 출처·문항의 "책 p.N"을 누르면 원문이 열립니다. 교재 PDF는 단원별로 잘라 비공개 저장소에 두고, 해당 단원 파일만 받아 교재 쪽수 자리에서 엽니다(서명 URL, 10분 만료). 스크립트는 텍스트 뷰어에서 인용된 조각을 강조하고 검색어를 표시합니다.

### 저장함·메모·통계
- 틀린 문항과 헷갈림 문항이 자동으로 모이고, 직접 저장한 문항도 들어옵니다. 틀림/헷갈림/직접 저장 필터, 이 목록 풀기, 묶음에 추가, "빼기"(다시 틀리면 자동 복귀).
- 통계: 단원·주제어(틀린 것이 있는 주제어만)·난이도·함정 유형·세트·태그별 정답률. "약점 섞어 풀기"는 약한 영역의 새 문항 60% + 저장된 문항 40%.
- 메모: 풀면서 쓴 메모가 과목 → 단원별로 누적되고, 해설·근거를 메모에 붙여 넣을 수 있습니다.

### 문제 넣기 (관리자)
- JSON(권장), "문제지 + 정답·해설" 텍스트, 번호만 적힌 복기 메모(`1 `, `1)`, `①`, `(1)` 모두 인식), PDF. 줄바꿈이 깨진 텍스트도 번호 패턴으로 다시 나눕니다.
- 미리보기에서 정답·해설·단원을 고친 뒤 저장. 같은 (과목, 단원, 번호/질문) 문항을 다시 올리면 중복 없이 덮어쓰며 풀이 기록은 유지됩니다. 검증 실패 문항은 목록으로 보여 주고 나머지는 저장합니다.
- 문항 메타: 세부 주제, 난이도(하/중/상/최상), 배점, 함정 유형, 근거 문장·쪽수, 문항 해설과 선지별 해설, 힌트.
- 단원 자동 배정: 원문 표시(`[26강]`, `unit_no`, `unit_path`) → 키워드 매칭 → (선택) AI 순. 과목 이름·단원 이름 정규화(예: 묶음 과목 + 과정 이름 → 과정별 독립 과목).
- 로컬 CLI(`npm run cli -- questions add`)와 MCP `import_questions`(check → commit)로도 넣을 수 있습니다. 세 길 모두 관리자만.

### 계정·권한·운영
- 이메일+비밀번호 또는 이메일 링크 로그인. 과목마다 `public` / `restricted`. 권한은 Postgres RLS로 강제되어 API로도 우회할 수 없습니다.
- 관리자 화면: 과목 생성, 사용자 권한, 단원 트리 편집, 자료·문제 업로드, 세트 편집, 신고 처리. 게시판(공지·질문).
- 게스트 체험: 비로그인 방문자는 공개 과목을 하루 5문항까지 풀어 보고 로그인으로 안내됩니다(기록은 저장되지 않음). 제한 과목은 보이지 않습니다. `PUBLIC_GUEST_ACCESS=false` 로 끌 수 있습니다.

## 설계 포인트

- **권한은 DB에서 결정**: 모든 테이블에 RLS. 과목 권한은 `access.readable_subject_ids()` 집합 하나를 재사용하고(쿼리당 1회 평가), 저장소(교재 PDF) 정책도 같은 집합을 따릅니다. 비로그인(anon)은 공개 과목 읽기 정책만 갖습니다. 통계·회독 계산은 `security invoker` SQL 함수로 사용자 권한 안에서 돕니다.
- **use case 와 서버 액션은 `Result<T>`** (`{ok, data} | {ok, error}`)로 통일하고 예외를 던지지 않습니다. 서버 액션은 use case 를 한 줄로 감쌉니다. service role 은 관리자 플래그 부여, 멤버 부여의 사용자 찾기, 로컬 CLI 에만 씁니다.
- **DDD 모놀리스**: 바운디드 컨텍스트 6개(access, catalog, learning, knowledge, community, integration)가 각자 Postgres 스키마와 테이블을 소유하고, 다른 컨텍스트는 공개 API(`index.ts`)로만 접근합니다. 컨텍스트 안은 domain(순수) → application(use case·포트) → infrastructure(Supabase 구현) → ui 네 계층이고 의존 방향은 eslint 가 강제합니다. 용어는 `docs/glossary.md`.
- **회독 계산**: 문항별 풀이 횟수의 최솟값이 완료 회독 수, 회독별 정답률은 문항마다 i번째 풀이의 정오로 계산합니다. 진행 중 진도는 "단원 전체를 담은 미완료 세션"에서만 세어 '틀린 것만 다시 풀기' 같은 부분 풀이가 진도로 잡히지 않게 했습니다.
- **근거 검색**: 임베딩이 있는 과목은 pgvector(HNSW) 벡터 유사도 + `tsvector` 키워드를 RRF 로 합친 하이브리드, 없는 과목은 키워드. 단원 우선 → 전체 순.
- **AI는 선택 기능**: `OPENAI_API_KEY`가 없어도 모든 기능이 동작합니다.
- **콘텐츠 분리**: 문제·자료 원본(`content/`)과 환경변수는 저장소에 넣지 않습니다.

## 구조

```
src/app/                  라우트 (얇게: 컨텍스트 로더 → 컴포넌트)
src/contexts/<ctx>/       ctx = access | catalog | learning | knowledge | community | integration
  domain/                 순수 TS: 엔티티·값 객체·불변식 (단위 테스트 옆에)
  application/            use case (deps, input) => Result, ports.ts(포트 인터페이스)
  infrastructure/         Supabase 리포지토리(db.schema("<ctx>")), 외부 어댑터(OpenAI), 조립(make-deps)
  ui/                     components/(클라이언트 안전), actions.ts(서버 액션), loaders.ts(페이지용)
  index.ts / server.ts / ui/index.ts   공개 API · 서버 조립 · 다른 컨텍스트 화면용 컴포넌트
src/shared/               공유 커널: Result, env, i18n, db 클라이언트·다중 스키마 타입, 트리·토크나이저 유틸
src/proxy.ts              세션 갱신 + 보호 경로 (Next 16 의 middleware)
supabase/migrations/      스키마 + RLS (테이블은 컨텍스트 스키마에), supabase/rollback/ 되돌리기 SQL
scripts/cli.ts            로컬 CLI (service role): subject · sources · questions · units · learning · doctor
tests/int/                통합 테스트 (로컬 Supabase), tests/e2e/ Playwright 시나리오
docs/glossary.md          용어사전
```

컨텍스트와 소유 테이블: access(profiles, subject_members) · catalog(subjects, units, questions, choices, question_sets, collections) · learning(attempts, quiz_sessions, marks, notes) · knowledge(sources, chunks, files, chat_logs) · community(posts, reports) · integration(MCP, 테이블 없음).

## 시작하기

```bash
npm install
cp .env.example .env.local      # 값 채우기
npm run db:start                # 로컬 Supabase (Docker 필요) — 또는 원격 프로젝트 사용
npm run dev
```

### 환경변수

| 이름 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon(publishable) 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용. 관리자 플래그, 게스트 모드, 로컬 스크립트에 사용 |
| `ADMIN_EMAIL` | 이 이메일로 로그인하면 자동으로 관리자 |
| `PUBLIC_GUEST_ACCESS` | `true`면 비로그인 방문자도 공개 과목을 풀 수 있음(기록은 저장되지 않음). 기본 `false` |
| `OPENAI_API_KEY` | 선택. AI 튜터, 규칙 파서가 실패한 텍스트의 AI 파싱, 단원 분류 보조 |
| `OPENAI_MODEL` | 선택. 기본 `gpt-6-luna` |
| `NEXT_PUBLIC_CANONICAL_HOST` | 선택. 링크 공유 미리보기에 쓰는 도메인 |

`.env*` 와 `content/` 는 git 에 올라가지 않습니다.

### 원격 Supabase 에 스키마 적용

```bash
supabase login
supabase link --project-ref <ref>
npx supabase db push --remote --yes
```

### 첫 설정 순서

1. 회원가입 후 `ADMIN_EMAIL` 계정으로 로그인하면 `/admin` 메뉴가 열립니다.
2. `/admin` 에서 과목을 만들고, 제한 과목이라면 이메일로 사용자에게 권한을 줍니다.
3. 자료가 있는 과목이면 `/admin/sources` 에서 목차 파일과 스크립트·교재 텍스트를 올리거나 로컬에서 일괄 업로드합니다.
   ```bash
   npm run cli -- sources add  "<과목 이름>" content/sources --kind note          # 자료 등록 + 조각 + 임베딩
   npm run cli -- sources file "<과목 이름>" content/sources/book.pdf --split     # 교재 PDF 를 단원별로 잘라 올림 → "원문 보기"
   ```
4. `/admin/upload` 에서 문제 파일을 올리거나 텍스트를 붙여 넣고 미리보기에서 확인 후 저장합니다. CLI 도 있습니다.
   ```bash
   npm run cli -- questions add "<과목 이름>" content/questions/*.json
   npm run cli -- questions add "<과목 이름>" content/questions/문제.txt --answers content/questions/정답.txt
   npm run cli -- help                                  # 전체 명령과 새 과목 세우기 순서
   ```

## 지원하는 문제 형식

**JSON** (과목·단원 경로를 적으면 단원이 자동으로 만들어집니다)
```json
{ "subject": "English - Interchange 2", "unit_path": ["Unit 1: Good memories"],
  "questions": [{ "no": 1, "prompt": "…", "correct_choice": 2, "explanation": "…", "difficulty": "easy",
                  "choices": [{ "ord": 1, "text": "…" }, { "ord": 2, "text": "…" }, { "ord": 3, "text": "…" }, { "ord": 4, "text": "…" }] }] }
```

**문제지 + 정답·해설**
```
1. 질문
1) 선지
2) 선지
3) 선지
4) 선지
```
```
1. 정답: 2번
  1) 틀림. 이유
  2) 옳음. 이유
```

**복기 메모** (정답·해설 없어도 됨. 저장 후 미리보기나 세트 화면에서 정답 지정)
```
1. 질문
1 선지
2 선지
3 선지
4 선지
```

전체 필드와 프롬프트는 [docs/quiz-prompt.md](docs/quiz-prompt.md) 에 있습니다.

## 개발

```bash
npm run typecheck && npm run lint && npm test     # 타입 · 계층 경계 lint · 단위 테스트
npm run test:int                                   # 통합 테스트 (로컬 Supabase: npm run db:start)
npm run test:e2e                                   # Playwright 시나리오 (로컬 Supabase, dev 서버 자동 실행)
```

스키마는 `supabase/migrations/` 에 있고, 바꾸면 `npm run db:types` 로 다중 스키마 타입을 다시 만듭니다. 새 스키마는 `supabase/config.toml` 의 `[api] schemas` 와 원격 PostgREST 노출 목록에 넣어야 합니다. 배포는 `git push origin main` 만으로 Vercel 이 자동으로 합니다.

## 아이콘

`src/app/icon.svg` 가 원본입니다. 바꾼 뒤 `npm run icons` 를 실행하면 파비콘(`favicon.ico`), 애플 홈 화면 아이콘, 매니페스트용 PNG(`public/icons/`), 링크 공유 미리보기(`opengraph-image.png`)가 다시 만들어집니다.

## 문서
- `docs/glossary.md` — 용어사전(한국어 UI 용어 ↔ 코드 이름). 새 이름은 이 표를 따른다.
