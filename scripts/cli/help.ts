/** help — 명령 목록과 새 과목을 세우는 순서 */

export const HELP = `mcquiz CLI  (service role · .env.local 을 읽는다 · 운영 DB 를 가리키면 그대로 반영된다)

  npm run cli -- <그룹> <명령> [인자] [--옵션]

과목 (subject)
  subject create "<과목>" [public|restricted]      과목 만들기 (이미 있으면 그대로 두고 알려 준다)
  subject visibility "<과목>" public|restricted    공개/제한 바꾸기
  subject grant "<과목>" <이메일>                  제한 과목 멤버 부여 (가입한 계정만)
  subject revoke "<과목>" <이메일>                 멤버 회수
  subject admin <이메일> [--off]                   관리자 플래그 켬/끔

자료 (sources, Knowledge)
  sources add "<과목>" <폴더> [--kind script|note|book|doc|other] [--parent <단원id>] [--no-embed]
                                                   폴더의 txt/md/pdf/html 을 자료로 등록. 목차 파일(목차·toc)이 있으면 먼저 단원을 만든다
  sources embed "<과목>" [--force] [--dry]         임베딩이 없는 조각 채우기 (--dry 는 개수·비용만)
  sources file "<과목>" <PDF> [--split] [--offset N] [--name book] [--title "제목"]
                                                   교재 PDF. --split 은 책 자료의 쪽 범위대로 단원별로 잘라 올리고 통째 파일은 지운다

문항 (questions, Catalog)
  questions add "<과목>" <파일|폴더...> [--set "<세트 이름>"] [--answers <정답파일>] [--no-ai]
                                                   JSON(v1/v2)·텍스트·PDF 문항 반입. 파일 하나 = 세트 하나. 같은 단원·질문은 덮어쓴다

단원 (units)
  units priority "<과목>" <1~5> "<단원번호,…>"     시작 화면 단원 옆 "n순위" 배지
  units priority "<과목>" clear                    순위 모두 지우기
  units priority "<과목>"                          현재 순위 보기

학습 (learning)
  learning export <이메일> "<과목>" [--top N] [--out <경로>]
                                                   학습 요약 Markdown → content/exports/ (출제 분석용, 이메일은 넣지 않는다)

점검
  doctor                                           .env.local 키, Supabase 연결·스키마 노출, 관리자 프로필, OpenAI 키, 임베딩 상태 (읽기만)
  help

새 과목을 세우는 순서
  1. npm run cli -- doctor                                        연결·키 확인
  2. npm run cli -- subject create "<과목>" restricted           과목 (공개면 public)
  3. npm run cli -- subject grant "<과목>" <이메일>              제한 과목이면 볼 사람 추가
  4. npm run cli -- sources add "<과목>" content/<폴더>          목차 → 단원, 스크립트·책 → 자료·조각·임베딩
  5. npm run cli -- questions add "<과목>" content/<문항 폴더>   문항 반입 (단원은 자동 분류, 정답 없는 문항은 /admin/sets 에서 검토)
  6. npm run cli -- units priority "<과목>" 1 "1,3,5"            (선택) 우선 단원 배지
  7. npm run cli -- sources file "<과목>" <교재.pdf> --split      (선택) "원문 보기" 교재 PDF

주의
  - 과목 이름은 글자까지 정확히 같아야 한다 (docs/glossary.md 의 이름 규칙).
  - --no-ai 를 주면 OpenAI 파싱·단원 분류를 끈다. OPENAI_API_KEY 가 없으면 자동으로 꺼진다.
  - 모든 명령은 실패하면 종료 코드 1 과 원인 한 줄을 낸다.
`;

export async function run(): Promise<void> {
  console.log(HELP);
}
