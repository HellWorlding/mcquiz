# mcquiz

객관식(4지·5지선다) 문제 파일을 올리면 바로 풀 수 있는 퀴즈 웹앱입니다. 한 문제씩 풀고 즉시 정답과 해설을 확인하며, 틀린 문제와 헷갈린 문제를 모아 다시 풉니다.

## 기능

- **문제 업로드 → 퀴즈 자동 변환**: JSON, "문제지 + 정답·해설" 텍스트, 번호만 적힌 복기 메모(`1 `, `1)`, `①`, `(1)` 모두 인식), PDF. 줄바꿈이 깨진 텍스트도 번호 패턴으로 다시 나눕니다. 미리보기에서 정답·해설·단원을 고친 뒤 저장합니다.
- **단원 트리**: 깊이 제한 없는 단원 구조. 문항은 원문 표시(`[26강]`), 키워드 매칭(Postgres 전문검색), 선택적으로 AI 순으로 단원에 자동 배정됩니다.
- **묶음(collections)**: 단원과 별개로 문제를 모아 두는 트리. 공용 묶음과 개인 묶음.
- **퀴즈**: 단원·묶음·세트 선택, 문항 수(10/20/40/전체)와 순서(순서대로/무작위), 구간 나눠 풀기, 선지 섞기(해설은 선지와 함께 이동), 힌트, 헷갈림 체크, 플래시카드 모드, 결과 요약과 "틀린 것만 다시 풀기".
- **약점 모음**: 틀린 문항·헷갈린 문항 목록, 단원·세트·태그별 정답률, 약한 영역의 새 문항 60% + 과거 오답 40%로 구성되는 "약점 섞어 풀기".
- **주제별 권한**: 주제마다 `public`(로그인한 모두) / `restricted`(허용된 사용자만). 권한은 Postgres RLS 로 강제되어 API 로도 우회할 수 없습니다.
- **관리자 화면** (`/admin`): 주제 생성, 사용자 권한 부여·회수, 단원 트리 편집(번호 범위 일괄 생성), 스크립트·노트·책 업로드(목차 파일로 단원 일괄 생성, PDF 페이지 번호 보존), 문제 업로드, 세트 편집.

## 스택

Next.js 16 (App Router, TypeScript) · Tailwind CSS v4 · Supabase (Auth, Postgres, RLS) · Vercel · OpenAI(선택)

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
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용. 관리자 플래그, 로컬 스크립트에 사용 |
| `ADMIN_EMAIL` | 이 이메일로 로그인하면 자동으로 관리자 |
| `PUBLIC_GUEST_ACCESS` | `true`면 비로그인 방문자도 공개 주제를 풀 수 있음(기록은 저장되지 않음). 기본 `false` |
| `OPENAI_API_KEY` | 선택. 규칙 파서가 실패한 텍스트의 AI 파싱, 단원 분류 보조 |
| `OPENAI_MODEL` | 선택. 기본 `gpt-6.1-terra` |

`.env*` 와 `content/` 는 git 에 올라가지 않습니다.

### 원격 Supabase 에 스키마 적용

```bash
supabase login
supabase link --project-ref <ref>
npm run db:push
```

### 첫 설정 순서

1. 회원가입 후 `ADMIN_EMAIL` 계정으로 로그인하면 `/admin` 메뉴가 열립니다.
2. `/admin` 에서 주제를 만들고, 제한 주제라면 이메일로 사용자에게 권한을 줍니다.
3. `/admin/sources` 에서 목차 파일과 스크립트를 올리거나, 로컬에서 일괄 업로드합니다.
   ```bash
   npm run upload:sources -- "<주제 이름>" content/sources
   ```
4. `/admin/upload` 에서 문제 파일을 올리거나 텍스트를 붙여 넣고 미리보기에서 확인 후 저장합니다. CLI 도 있습니다.
   ```bash
   npm run upload:questions -- "<주제 이름>" content/questions/문제.txt content/questions/정답.txt
   ```

## 지원하는 문제 형식

**JSON**
```json
[{ "prompt": "질문", "choice_count": 4, "correct_choice": 2, "unit_no": 3,
   "choices": [{ "ord": 1, "text": "…", "explanation": null }, { "ord": 2, "text": "…", "explanation": "정답 이유" }] }]
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

## 개발

```bash
npm run typecheck && npm run lint && npm test
```

스키마는 `supabase/migrations/` 에 있고, 바꾸면 `supabase gen types typescript --local > src/domains/shared/database.types.ts` 로 타입을 다시 만듭니다.
