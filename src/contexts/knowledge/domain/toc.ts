/** 목차 파일·파일명 규칙 (순수). 자료 등록 때 단원을 만들거나 파일을 단원에 연결하는 데 쓴다 */
export type TocRow = { no: number; title: string };

/** 목차 파일 여부: 파일명에 '목차' 가 있거나 첫 줄이 '차시<TAB>수업명' 처럼 생겼으면 목차 */
export function looksLikeToc(filename: string, text: string): boolean {
  if (/목차|toc|syllabus/i.test(filename)) return true;
  const first = text.split(/\r?\n/).find((l) => l.trim());
  return !!first && /^(차시|회차|번호|no\.?|강)\s*\t/i.test(first.trim());
}

/** 탭 구분 목차(차시 \t 수업명 …) 또는 "N강 제목" 줄 목록 → 단원 행 */
export function parseToc(text: string): TocRow[] {
  const rows: TocRow[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const cols = t.split(/\t+/).map((c) => c.trim());
    if (cols.length >= 2 && /^\d{1,3}$/.test(cols[0]) && cols[1]) {
      rows.push({ no: +cols[0], title: cols[1] });
      continue;
    }
    const m = /^\s*(?:제\s*)?(\d{1,3})\s*(?:강|차시|단원|과|회)[.)\]:\s-]*(.+)$/.exec(t);
    if (m) rows.push({ no: +m[1], title: m[2].trim() });
  }
  return rows;
}

/** 파일명에서 단원 번호를 찾는다 ("31강 교원.txt", "part3.md", 숫자가 하나뿐인 이름). 못 찾으면 null */
export function unitNoFromFilename(name: string): number | null {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const m = /(\d{1,3})\s*(?:강|차시|단원|과|회)/.exec(base) ?? /(?:part|파트|day|unit)\s*[-_ ]?(\d{1,3})/i.exec(base);
  if (m) return +m[1];
  const nums = base.match(/\d{1,3}/g);
  if (nums && nums.length === 1) return +nums[0];
  return null;
}

/** 목차 파일을 먼저 처리해야 나머지 파일이 단원에 연결된다 */
export function sortTocFirst<T>(items: T[], name: (x: T) => string): T[] {
  const isToc = (x: T) => (/목차|toc/i.test(name(x)) ? 1 : 0);
  return [...items].sort((a, b) => isToc(b) - isToc(a));
}

type UnitLike = { id: string; no: number | null; title: string; parentId: string | null };

/** 파일명 번호로 단원을 고른다: 지정한 상위 단원 아래 → 최상위 → 아무 것 */
export function resolveUnitByFilename<U extends UnitLike>(filename: string, units: U[], parentUnitId: string | null): U | null {
  const no = unitNoFromFilename(filename);
  if (no === null) return null;
  const hits = units.filter((u) => u.no === no);
  return (parentUnitId ? hits.find((x) => x.parentId === parentUnitId) : null) ?? hits.find((x) => x.parentId === null) ?? hits[0] ?? null;
}
