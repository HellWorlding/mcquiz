/**
 * 과목의 자료 조각에 임베딩을 채운다 (없는 것만; --force 면 전부 다시).
 *   npm run embed:chunks -- "<주제 이름>" [--force] [--dry]
 * 임베딩 모델은 .env.local 의 EMBEDDING_MODEL (기본 text-embedding-3-large). OPENAI_API_KEY 가 필요하다.
 */
import { adminDb, findSubject } from "./_db";
import { embedChunks } from "../src/domains/import/embed-chunks";
import { embeddingModel, estimateTokens } from "../src/domains/import/embed";

async function main() {
  const args = process.argv.slice(2);
  const [subjectName] = args;
  if (!subjectName) {
    console.error('사용법: npm run embed:chunks -- "<주제 이름>" [--force] [--dry]');
    process.exit(1);
  }
  const force = args.includes("--force");
  const dry = args.includes("--dry");
  const db = adminDb();
  const subject = await findSubject(db, subjectName);

  // 현황
  const { count: total } = await db.from("source_chunks").select("id", { count: "exact", head: true }).eq("subject_id", subject.id);
  const { count: embedded } = await db.from("source_chunks").select("id", { count: "exact", head: true }).eq("subject_id", subject.id).eq("embedding_model", embeddingModel());
  const todo = force ? (total ?? 0) : (total ?? 0) - (embedded ?? 0);
  console.log(`주제 "${subject.name}": 조각 ${total ?? 0}개, 현재 모델(${embeddingModel()}) 임베딩 ${embedded ?? 0}개 → 할 일 ${todo}개`);
  if (todo === 0) return;

  // 비용 어림
  let chars = 0;
  let tokens = 0;
  for (let from = 0; ; from += 1000) {
    let q = db.from("source_chunks").select("content").eq("subject_id", subject.id);
    if (!force) q = q.or(`embedding.is.null,embedding_model.neq.${embeddingModel()}`);
    const { data } = await q.range(from, from + 999);
    for (const r of data ?? []) {
      chars += r.content.length;
      tokens += estimateTokens(r.content);
    }
    if (!data || data.length < 1000) break;
  }
  console.log(`  글자 ${chars.toLocaleString()}자 ≈ ${tokens.toLocaleString()} 토큰 ≈ $${((tokens / 1_000_000) * 0.13).toFixed(3)}`);
  if (dry) return;
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY 가 .env.local 에 없습니다.");
    process.exit(1);
  }

  const t0 = Date.now();
  const p = await embedChunks(db, { subjectId: subject.id }, {
    force,
    onBatch: (x) => process.stdout.write(`\r  ${x.done}/${x.total} (${Math.round((Date.now() - t0) / 1000)}초)`),
  });
  process.stdout.write("\n");
  if (p.failed) {
    console.error(`실패: ${p.failed} (${p.done}/${p.total} 까지 저장됨. 다시 실행하면 이어서 합니다)`);
    process.exit(1);
  }
  console.log(`완료: ${p.done}개 임베딩 (${Math.round((Date.now() - t0) / 1000)}초)`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
