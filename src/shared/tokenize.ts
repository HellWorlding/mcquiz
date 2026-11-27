/** 한국어·영어 문장을 단원 분류용 키워드 토큰으로 쪼갠다 (순수 함수, 테스트 가능) */

const PARTICLES = [
  "으로부터", "에서는", "으로는", "에게는", "에서도", "까지는", "부터는",
  "으로", "에서", "에게", "까지", "부터", "처럼", "보다", "마다", "이며", "이다", "이고", "이나",
  "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도", "만", "며", "고",
];

const STOPWORDS = new Set([
  "것은", "것을", "것이", "것", "다음", "설명", "옳은", "옳지", "않은", "틀린", "가장", "거리", "먼", "경우",
  "대한", "관한", "중", "및", "또는", "등", "수", "있다", "없다", "한다", "된다", "하는", "되는", "있는", "없는",
  "아닌", "해당", "내용", "고르시오", "고르면", "무엇", "어느", "알맞은", "적절한", "바르게", "연결한", "모두",
  "않는", "하지", "않다", "그", "이", "저", "때", "위해", "통해", "따라", "대해", "하여", "따른", "관련",
  "이상", "이하", "이내", "경우에", "때문", "정답", "해설", "옳음", "틀림", "문제", "문항", "선지",
]);

function stripParticle(tok: string): string {
  for (const p of PARTICLES) {
    if (tok.length - p.length >= 2 && tok.endsWith(p)) return tok.slice(0, -p.length);
  }
  return tok;
}

export function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (const t of raw) {
    if (t.length < 2 || /^\d+$/.test(t)) continue;
    const s = stripParticle(t);
    if (s.length < 2 || STOPWORDS.has(s) || STOPWORDS.has(t)) continue;
    out.add(s);
    // 복합어는 앞 2~3글자도 넣어 접두 매칭 범위를 넓힌다 (예: 교육목표관리 → 교육목표)
    if (/^[가-힣]+$/.test(s) && s.length >= 5) out.add(s.slice(0, 3));
  }
  return [...out];
}
