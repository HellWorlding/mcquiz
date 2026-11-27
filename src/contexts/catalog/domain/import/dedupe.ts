import type { PreviewQuestion } from "./types";

/** 공백·대소문자 차이를 무시한 질문문 비교 키 */
export const normalizePrompt = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export type ExistingQuestion = { id: string; unitId: string | null; prompt?: string; ord?: number };

/**
 * C7. 반입 문항을 "덮어쓸 기존 문항" 과 "새로 넣을 문항" 으로 나눈다.
 *  1) 같은 파일(source_filename)에서 온 같은 단원·같은 번호 → 질문문이 바뀌어도 같은 문항
 *  2) 같은 과목·같은 단원·같은 질문문 → 같은 문항 (다른 단원이면 새 문항)
 * 기존 문항 하나는 한 번만 덮어쓴다.
 */
export function planImport(
  questions: PreviewQuestion[],
  existing: { byFilePos: ExistingQuestion[]; byPrompt: ExistingQuestion[] },
): { toInsert: PreviewQuestion[]; toUpdate: { id: string; q: PreviewQuestion }[] } {
  const posKey = new Map<string, string>();
  for (const r of existing.byFilePos) posKey.set(`${r.unitId ?? ""}|${r.ord}`, r.id);
  const promptKey = new Map<string, string>();
  for (const r of existing.byPrompt) promptKey.set(`${r.unitId ?? ""}|${r.prompt}`, r.id);
  const toInsert: PreviewQuestion[] = [];
  const toUpdate: { id: string; q: PreviewQuestion }[] = [];
  const used = new Set<string>();
  questions.forEach((q, i) => {
    const no = q.no ?? i + 1;
    const id = posKey.get(`${q.unitId ?? ""}|${no}`) ?? promptKey.get(`${q.unitId ?? ""}|${q.prompt}`);
    if (id && !used.has(id)) {
      used.add(id);
      toUpdate.push({ id, q });
    } else toInsert.push(q);
  });
  return { toInsert, toUpdate };
}

/** C7. 같은 과목에 질문문이 (정규화해서) 같은 기존 문항이 있는 반입 문항의 질문문 앞부분 */
export function findDuplicatePrompts(incoming: { prompt: string }[], existingPrompts: string[]): string[] {
  const set = new Set(existingPrompts.map(normalizePrompt));
  return incoming.filter((q) => set.has(normalizePrompt(q.prompt))).map((q) => q.prompt.slice(0, 60));
}
