import type { Unit } from "../types";

/** 예전 파일에 적힌 한글 주제 이름 → 지금 쓰는 이름 */
const SUBJECT_ALIASES: Record<string, string> = { 토익: "TOEIC" };
export const normalizeSubjectName = (name: string) => SUBJECT_ALIASES[name.trim()] ?? name.trim();

/** 예전 파일에 적힌 한글 단원 이름 → 지금 쓰는 영어 이름 ("콜로케이션"→"Collocation", "파트3"→"Part 3", "세트07"→"Set 7") */
const UNIT_ALIASES: Record<string, string> = { 콜로케이션: "Collocation", 어휘: "Vocabulary", 문법: "Grammar", 듣기: "Listening", 독해: "Reading" };
export function normalizeUnitTitle(title: string): string {
  const t = title.trim();
  if (UNIT_ALIASES[t]) return UNIT_ALIASES[t];
  const m = /^(파트|세트)\s*0*(\d{1,3})$/.exec(t);
  if (m) return `${m[1] === "파트" ? "Part" : "Set"} ${m[2]}`;
  return t;
}

/**
 * 묶음 과목(TOEIC, English)은 과정별로 과목을 나눈다. 파일에 묶음 이름 + 과정이 첫 단원으로 적혀 있으면
 * "TOEIC(English) - Collocation" 처럼 과목 이름을 합치고 단원 경로에서 첫 단계를 뺀다.
 *   ("토익", ["콜로케이션", "파트3"])                      → ("TOEIC(English) - Collocation", ["Part 3"])
 *   ("English", ["Listening & Speaking 2", "Unit 3"])       → ("English - Listening and Speaking 2", ["Unit 3"])
 *   ("English", ["Grammar in Use Intermediate", "Passive", "Unit 42: …"]) → ("English - Grammar in Use", ["Passive", "Unit 42: …"])
 */
const UMBRELLAS: Record<string, string> = { TOEIC: "TOEIC(English)", "TOEIC(English)": "TOEIC(English)", English: "English" };
const COURSE_ALIASES: [RegExp, string][] = [
  [/^listening\s*(&|and)\s*speaking\s*2$/i, "Listening and Speaking 2"],
  [/^grammar in use\b.*$/i, "Grammar in Use"],
];
const courseName = (title: string) => {
  const t = normalizeUnitTitle(title);
  return COURSE_ALIASES.find(([re]) => re.test(t))?.[1] ?? t;
};
export function normalizeTarget(subject: string | null, unitPath: string[] | null): { subject: string | null; unitPath: string[] | null } {
  const name = subject ? normalizeSubjectName(subject) : null;
  const path = unitPath?.map(normalizeUnitTitle).filter(Boolean) ?? null;
  if (name && UMBRELLAS[name] && path && path.length >= 1) {
    return { subject: `${UMBRELLAS[name]} - ${courseName(path[0])}`, unitPath: path.slice(1) };
  }
  return { subject: name, unitPath: path };
}

/** "파트3", "Part 3", "Day12", "세트07", "Set 7", "3강" → 3. "1. 머신러닝" → 1, "1.3 평가 지표" → 3 (점 번호는 마지막 자리) */
export function unitNoFromTitle(title: string): number | null {
  const dotted = /^(\d{1,3})(?:\.(\d{1,3}))?[.)]?\s/.exec(title.trim());
  if (dotted) return +(dotted[2] ?? dotted[1]);
  const m =
    /(?:파트|part|day|unit|set|세트|lesson|chapter|챕터|회차|강|회|장)\s*[-_ ]?(\d{1,3})|(\d{1,3})\s*(?:강|회|장|과|세트|일차)/i.exec(title);
  if (m) return +(m[1] ?? m[2]);
  return null;
}

/**
 * 단원 경로를 기존 단원 목록에서 따라간다 (순수). 찾은 마지막 단원 id 와, 없어서 만들어야 하는 나머지 경로를 돌려준다.
 *   전부 있으면 missing = [] · 중간부터 없으면 parentId = 마지막으로 찾은 단원, missing = 그 아래 만들 제목들
 */
export function walkUnitPath(units: Unit[], subjectId: string, path: string[]): { parentId: string | null; missing: string[] } {
  let parentId: string | null = null;
  const titles = path.map(normalizeUnitTitle).filter(Boolean);
  for (let i = 0; i < titles.length; i++) {
    const existing = units.find((u) => u.subjectId === subjectId && u.parentId === parentId && u.title === titles[i]);
    if (!existing) return { parentId, missing: titles.slice(i) };
    parentId = existing.id;
  }
  return { parentId, missing: [] };
}

/**
 * 파일명으로 과목·단원 경로를 추정한다.
 *  toeic_collocation_part3.json → { subject: "TOEIC(English) - Collocation", unitPath: ["Part 3"] }
 */
const TOEIC_GROUPS: Record<string, string> = {
  collocation: "Collocation",
  collocations: "Collocation",
  part5: "Part 5 Words",
  vocab: "Vocabulary",
  vocabulary: "Vocabulary",
  hackers: "Hackers Words",
  grammar: "Grammar",
  listening: "Listening",
  reading: "Reading",
};

export function targetFromFilename(filename: string): { subject: string; unitPath: string[] | null } | null {
  const base = filename.replace(/\.[a-z0-9]+$/i, "");
  const m = /^toeic(?:[_-]([a-z0-9]+))?(?:[_-](?:part|day|unit|set)[_-]?(\d{1,3}))?/i.exec(base);
  if (!m) return null;
  const group = m[1] ? (TOEIC_GROUPS[m[1].toLowerCase()] ?? m[1]) : null;
  const n = m[2] ? +m[2] : null;
  const isSet = /[_-]set[_-]?\d/i.test(base);
  const path: string[] = [];
  if (group) path.push(group);
  if (n !== null) path.push(isSet ? `Set ${n}` : `Part ${n}`);
  const t = normalizeTarget("TOEIC", path);
  return { subject: t.subject ?? "TOEIC(English)", unitPath: t.unitPath?.length ? t.unitPath : null };
}
