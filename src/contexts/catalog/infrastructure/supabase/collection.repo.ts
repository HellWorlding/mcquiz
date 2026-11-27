import type { Db } from "@/shared/db/types";
import { allRows } from "@/shared/paginate";
import type { CollectionRepo } from "../../application/ports";
import { check, must, toCollection } from "./mappers";

export function collectionRepo(db: Db): CollectionRepo {
  const t = () => db.schema("catalog").from("collections");
  const items = () => db.schema("catalog").from("collection_items");
  return {
    async list(subjectId) {
      const { data } = await t().select("*").eq("subject_id", subjectId).order("sort");
      return (data ?? []).map(toCollection);
    },
    async byId(id) {
      const { data } = await t().select("*").eq("id", id).maybeSingle();
      return data ? toCollection(data) : null;
    },
    async allRefs() {
      const { data } = await t().select("id, parent_id");
      return (data ?? []).map((c) => ({ id: c.id, parentId: c.parent_id }));
    },
    async itemIds(collectionIds) {
      if (collectionIds.length === 0) return [];
      // 1,000행 넘는 묶음도 끝까지 (페이지 경계가 흔들리지 않게 (collection_id, question_id) 로 보조 정렬)
      const rows = await allRows<{ question_id: string }>((f, to) =>
        items().select("question_id").in("collection_id", collectionIds).order("added_at").order("collection_id").order("question_id").range(f, to),
      );
      return rows.map((r) => r.question_id);
    },
    async itemCounts(subjectId) {
      const { data: cols } = await t().select("id").eq("subject_id", subjectId);
      const ids = (cols ?? []).map((c) => c.id);
      const out = new Map<string, number>();
      if (ids.length === 0) return out;
      const rows = await allRows<{ collection_id: string }>((f, to) =>
        items().select("collection_id").in("collection_id", ids).order("collection_id").order("question_id").range(f, to),
      );
      for (const r of rows) out.set(r.collection_id, (out.get(r.collection_id) ?? 0) + 1);
      return out;
    },
    async create(r) {
      return toCollection(must(await t().insert({ subject_id: r.subjectId, parent_id: r.parentId, title: r.title, scope: r.scope, created_by: r.createdBy }).select("*").single()));
    },
    async rename(id, title) {
      check(await t().update({ title }).eq("id", id));
    },
    async delete(id) {
      check(await t().delete().eq("id", id));
    },
    async addItems(collectionId, questionIds) {
      check(await items().upsert(questionIds.map((question_id) => ({ collection_id: collectionId, question_id })), { ignoreDuplicates: true }));
    },
    async removeItem(collectionId, questionId) {
      check(await items().delete().eq("collection_id", collectionId).eq("question_id", questionId));
    },
  };
}
