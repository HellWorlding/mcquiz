import type { Db, Row } from "@/shared/db/types";
import { toSourceKind, type Source } from "../../domain/source";
import type { SourceRepo, SourceWithContent } from "../../application/ports";

type SourceRow = Row<"knowledge", "sources">;
const LIST_COLS = "id, subject_id, unit_id, kind, title, url, page_range, created_at";

function toSource(r: Pick<SourceRow, "id" | "subject_id" | "unit_id" | "kind" | "title" | "url" | "page_range" | "created_at">): Source {
  return { id: r.id, subjectId: r.subject_id, unitId: r.unit_id, kind: toSourceKind(r.kind, "other"), title: r.title, url: r.url, pageRange: r.page_range, createdAt: r.created_at };
}

export function sourceRepo(db: Db): SourceRepo {
  const t = () => db.schema("knowledge").from("sources");
  return {
    async list(subjectId, unitId) {
      let q = t().select(LIST_COLS).eq("subject_id", subjectId).order("created_at");
      if (unitId) q = q.eq("unit_id", unitId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      // 조각·임베딩 수 (MCP list_sources 가 보여 준다)
      // 행을 내려받지 않고 자료마다 count 만 (1,000행 상한에 안 걸린다 — 검토 m8)
      const c = () => db.schema("knowledge").from("chunks");
      const counts = await Promise.all(
        (data ?? []).map(async (s) => {
          const [all, emb] = await Promise.all([
            c().select("id", { count: "exact", head: true }).eq("source_id", s.id),
            c().select("id", { count: "exact", head: true }).eq("source_id", s.id).not("embedded_at", "is", null),
          ]);
          return { chunks: all.count ?? 0, embedded: emb.count ?? 0 };
        }),
      );
      return (data ?? []).map((s, i) => ({ ...toSource(s), chunkCount: counts[i].chunks, embeddedCount: counts[i].embedded }));
    },
    async byId(id) {
      const { data, error } = await t().select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const s: SourceWithContent = { ...toSource(data), content: data.content };
      return s;
    },
    async idsByTitle(subjectId, title) {
      const { data, error } = await t().select("id").eq("subject_id", subjectId).eq("title", title);
      if (error) throw new Error(error.message);
      return (data ?? []).map((d) => d.id);
    },
    async insert(input) {
      const { data, error } = await t()
        .insert({ subject_id: input.subjectId, unit_id: input.unitId, kind: input.kind, title: input.title, content: input.content, page_range: input.pageRange, url: input.url })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "저장 실패");
      return data.id;
    },
    async deleteMany(ids) {
      if (ids.length === 0) return;
      const { error } = await t().delete().in("id", ids);
      if (error) throw new Error(error.message);
    },
    async countBySubject(subjectId) {
      const { count, error } = await t().select("id", { count: "exact", head: true }).eq("subject_id", subjectId);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async titlesByIds(ids) {
      const out = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await t().select("id, title").in("id", ids.slice(i, i + 200));
        if (error) throw new Error(error.message);
        for (const s of data ?? []) out.set(s.id, s.title);
      }
      return out;
    },
    async booksWithRange(subjectId) {
      const { data, error } = await t().select("id, title, unit_id, page_range").eq("subject_id", subjectId).eq("kind", "book").not("page_range", "is", null);
      if (error) throw new Error(error.message);
      return (data ?? []).map((b) => ({ id: b.id, title: b.title, unitId: b.unit_id, pageRange: b.page_range ?? "" }));
    },
  };
}
