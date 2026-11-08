/**
 * 폴더의 questions_*.json 을 전부 올린다. 같은 (주제, 단원, 질문) 문항은 덮어쓴다.
 *   npm run import:questions -- <폴더> [--subject "<주제 이름>"] [--no-ai]
 * 주제를 생략하면 .env.local 의 DEFAULT_SUBJECT 를 쓴다.
 * 내용이 바뀌지 않은 파일은 건너뛴다 (content/.import-cache.json 에 해시 기록). --force 로 전부 다시 올린다.
 * 파일/문항의 "subject" 와 "unit_path" 가 있으면 그 주제·단원으로 간다 (단원은 없으면 만든다).
 * toeic_*.json 은 토익 주제로 처리하고 파일명(toeic_collocation_part3)에서 단원 경로를 추정한다.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { adminDb, findSubject } from "./_db";
import { parseJsonQuestions } from "../src/domains/import/parse-json";
import { unitNoFromFilename } from "../src/domains/import/parse-text";
import { classifyQuestion } from "../src/domains/import/classify";
import { saveQuestionSet, validateQuestions } from "../src/domains/import/save";
import { ensureUnitPath, resolveSubjectByName, targetFromFilename } from "../src/domains/import/targets";
import type { PreviewQuestion } from "../src/domains/import/types";
import type { Unit } from "../src/domains/shared/types";

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--subject");
  const si = args.indexOf("--subject");
  const subjectName = si >= 0 ? args[si + 1] : process.env.DEFAULT_SUBJECT;
  const allowAI = !args.includes("--no-ai");
  const force = args.includes("--force");
  if (!dir || !subjectName) {
    console.error('사용법: npm run import:questions -- <폴더> --subject "<주제 이름>"  (또는 .env.local 에 DEFAULT_SUBJECT 설정)');
    process.exit(1);
  }
  const db = adminDb();
  const defaultSubject = await findSubject(db, subjectName);
  // 주제별 단원 캐시
  const unitsBySubject = new Map<string, Unit[]>();
  const unitsOf = async (sid: string) => {
    if (!unitsBySubject.has(sid)) {
      const { data } = await db.from("units").select("*").eq("subject_id", sid);
      unitsBySubject.set(sid, data ?? []);
    }
    return unitsBySubject.get(sid)!;
  };
  const subjectIdByName = new Map<string, string>([[defaultSubject.name, defaultSubject.id]]);
  const subjectIdOf = async (name: string) => {
    if (!subjectIdByName.has(name)) {
      const s = await resolveSubjectByName(db, name, { createIfMissing: true, visibility: "public" });
      if (!s) throw new Error(`주제 "${name}" 를 찾지 못했습니다`);
      subjectIdByName.set(name, s.id);
    }
    return subjectIdByName.get(name)!;
  };
  const files = readdirSync(dir)
    .filter((f) => /^(questions_|toeic).*\.json$/i.test(f))
    .sort((a, b) => (unitNoFromFilename(a) ?? 0) - (unitNoFromFilename(b) ?? 0));
  if (files.length === 0) {
    console.error(`${dir} 에 questions_*.json 이 없습니다.`);
    process.exit(1);
  }
  console.log(`${files.length}개 파일 (기본 주제 "${defaultSubject.name}")`);
  const cachePath = join("content", ".import-cache.json");
  let cache: Record<string, string> = {};
  try {
    if (existsSync(cachePath)) cache = JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {}
  const cacheKey = (f: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}|${defaultSubject.id}|${f}`;
  let totalIns = 0, totalUpd = 0, totalFail = 0, skipped = 0;
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    const hash = createHash("sha256").update(text).digest("hex");
    if (!force && cache[cacheKey(f)] === hash) {
      skipped++;
      continue;
    }
    const parsed = parseJsonQuestions(text);
    if (parsed.questions.length === 0) {
      console.log(`  [skip] ${f}: ${parsed.warnings.join("; ") || "문항 없음"}`);
      continue;
    }
    const fileUnit = unitNoFromFilename(f);
    const fromName = targetFromFilename(f);
    const preview: PreviewQuestion[] = [];
    for (let i = 0; i < parsed.questions.length; i++) {
      const q = parsed.questions[i];
      const subjName = q.subjectName ?? fromName?.subject ?? null;
      const sid = subjName ? await subjectIdOf(subjName) : defaultSubject.id;
      const units = await unitsOf(sid);
      const path = q.unitPath ?? (subjName ? fromName?.unitPath ?? null : null);
      if (path && path.length) {
        const unitId = await ensureUnitPath(db, sid, path, units);
        preview.push({ ...q, key: `q${i}`, subjectId: sid, unitId, unitConfidence: 1, unitCandidates: [] });
        continue;
      }
      if (q.unitHint === null && fileUnit !== null && !subjName) q.unitHint = fileUnit;
      const a = await classifyQuestion(db, sid, units, q, { useAI: allowAI });
      preview.push({ ...q, key: `q${i}`, subjectId: sid, unitId: a.unitId, unitConfidence: a.confidence, unitCandidates: a.candidates });
    }
    const { valid, failed } = validateQuestions(preview);
    for (const x of failed) console.log(`  [실패] ${f} #${x.index + 1}: ${x.reason} — ${x.prompt.slice(0, 40)}`);
    if (valid.length === 0) {
      console.log(`  [skip] ${f}: 저장할 문항 없음`);
      totalFail += failed.length;
      continue;
    }
    // 주제별로 나눠 저장 (교직실무 문항과 토익 문항은 절대 섞이지 않는다)
    const bySubject = new Map<string, PreviewQuestion[]>();
    for (const q of valid) {
      const sid = q.subjectId ?? defaultSubject.id;
      bySubject.set(sid, [...(bySubject.get(sid) ?? []), q]);
    }
    let ins = 0, upd = 0;
    for (const [sid, qs] of bySubject) {
      const r = await saveQuestionSet(db, {
        subjectId: sid,
        title: parsed.title ?? basename(f).replace(/\.json$/i, ""),
        sourceFilename: f,
        createdBy: null,
        questions: qs,
      });
      ins += r.inserted; upd += r.updated;
    }
    totalIns += ins; totalUpd += upd; totalFail += failed.length;
    const subjNames = [...bySubject.keys()].map((sid) => [...subjectIdByName.entries()].find(([, v]) => v === sid)?.[0] ?? sid);
    console.log(`  [ok] ${f} → ${subjNames.join(", ")}: 새로 ${ins}, 덮어씀 ${upd}, 실패 ${failed.length}`);
    if (failed.length === 0) {
      cache[cacheKey(f)] = hash;
      mkdirSync("content", { recursive: true });
      writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    }
  }
  console.log(`합계: 새로 ${totalIns}, 덮어씀 ${totalUpd}, 실패 ${totalFail}${skipped ? `, 변경 없어 건너뜀 ${skipped}` : ""}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
