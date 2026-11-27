import type { Db } from "@/shared/db/types";
import type { FileStorage } from "../../application/ports";

/** 교재 PDF 저장소 (비공개 버킷 "sources"). 읽기 권한은 저장소 RLS(public.can_read_subject)가 결정한다 */
export const SOURCES_BUCKET = "sources";

export function supabaseStorage(db: Db, bucket = SOURCES_BUCKET): FileStorage {
  return {
    async signedUrl(path, expiresSec) {
      const { data } = await db.storage.from(bucket).createSignedUrl(path, expiresSec);
      return data?.signedUrl ?? null;
    },
    async upload(path, bytes, contentType) {
      const { error } = await db.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error(error.message);
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await db.storage.from(bucket).remove(paths);
      if (error) throw new Error(error.message);
    },
  };
}
