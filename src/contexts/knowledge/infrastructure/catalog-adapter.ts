import type { CatalogPort, QuestionRef, UnitRef } from "../application/ports";

/**
 * Knowledge 가 Catalog 공개 API(PRD-04 §4 CatalogApi) 에서 쓰는 부분. 구조적 타입이라 CatalogApi 를 그대로 넘기면 된다.
 * (catalog 컨텍스트가 완성되면 `import type { CatalogApi } from "@/contexts/catalog"` 로 바꿀 수 있다)
 */
export type CatalogApiLike = {
  getSubject(id: string): Promise<{ id: string; name: string } | null>;
  listUnits(subjectId: string): Promise<{ id: string; no: number | null; title: string; parentId: string | null }[]>;
  questionsByIds(ids: string[]): Promise<
    { id: string; subjectId: string; unitId: string | null; prompt: string; topic: string | null; sourceQuote: string | null; explanation: string | null; correctChoice: number | null; choices: { ord: number; text: string }[] }[]
  >;
  createUnit(input: { subjectId: string; parentId: string | null; title: string; no: number | null }): Promise<unknown>;
};

export function catalogAdapter(catalog: CatalogApiLike): CatalogPort {
  const units = async (subjectId: string): Promise<UnitRef[]> => (await catalog.listUnits(subjectId)).map((u) => ({ id: u.id, no: u.no, title: u.title, parentId: u.parentId }));
  return {
    async questionById(id) {
      const q = (await catalog.questionsByIds([id]))[0];
      if (!q) return null;
      const ref: QuestionRef = {
        id: q.id,
        subjectId: q.subjectId,
        unitId: q.unitId,
        prompt: q.prompt,
        topic: q.topic,
        sourceQuote: q.sourceQuote,
        explanation: q.explanation,
        correctChoice: q.correctChoice,
        choices: q.choices.map((c) => ({ ord: c.ord, text: c.text })),
      };
      return ref;
    },
    listUnits: units,
    async subjectName(subjectId) {
      return (await catalog.getSubject(subjectId))?.name ?? null;
    },
    /** 목차 행으로 단원을 만든다 (옛 createUnitsFromToc). 같은 부모 아래 같은 no 는 건너뛴다 */
    async ensureUnits(subjectId, rows, parentId) {
      if (rows.length === 0) return { created: 0, skipped: 0 };
      const have = new Set((await units(subjectId)).filter((u) => u.parentId === parentId).map((u) => u.no));
      const fresh = rows.filter((r) => !have.has(r.no));
      for (const r of fresh) {
        const res = await catalog.createUnit({ subjectId, parentId, title: r.title, no: r.no });
        if (res && typeof res === "object" && "ok" in res && (res as { ok: boolean }).ok === false) throw new Error(String((res as { error?: string }).error ?? "단원 생성 실패"));
      }
      return { created: fresh.length, skipped: rows.length - fresh.length };
    },
  };
}
