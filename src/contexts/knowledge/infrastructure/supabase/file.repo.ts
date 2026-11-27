import type { Db, Row } from "@/shared/db/types";
import type { FileRepo, SubjectFile } from "../../application/ports";

type FileRow = Row<"knowledge", "files">;
const toFile = (r: FileRow): SubjectFile => ({ id: r.id, subjectId: r.subject_id, unitId: r.unit_id, name: r.name, title: r.title, storagePath: r.storage_path, pageOffset: r.page_offset, pageFrom: r.page_from, pageTo: r.page_to, pages: r.pages });

export function fileRepo(db: Db): FileRepo {
  const t = () => db.schema("knowledge").from("files");
  return {
    async byId(id) {
      const { data, error } = await t().select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toFile(data) : null;
    },
    async findByPage(subjectId, page) {
      const { data, error } = await t().select("*").eq("subject_id", subjectId).lte("page_from", page).gte("page_to", page).order("page_from").limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toFile(data) : null;
    },
    async findWhole(subjectId) {
      const { data, error } = await t().select("*").eq("subject_id", subjectId).eq("name", "book").maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toFile(data) : null;
    },
    async upsert(f) {
      const { error } = await t().upsert(
        { subject_id: f.subjectId, unit_id: f.unitId, name: f.name, title: f.title, storage_path: f.storagePath, page_offset: f.pageOffset, page_from: f.pageFrom, page_to: f.pageTo, pages: f.pages },
        { onConflict: "subject_id,name" },
      );
      if (error) throw new Error(error.message);
    },
    async delete(id) {
      const { error } = await t().delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}
