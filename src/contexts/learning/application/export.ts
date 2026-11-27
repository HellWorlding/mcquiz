import { err, ok, type Result } from "@/shared/result";
import { buildRecord, buildSavedExport, exportFileBase, type ExportRow } from "../domain/export";
import { savedBoxFilter } from "../domain/saved-box";
import { buildLearningSummary } from "../domain/summary";
import { unitPathOf } from "../domain/export";
import type { QuestionStat, QuizQuestion } from "../domain/types";
import type { LearningDeps } from "./ports";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const LOGIN = "로그인이 필요합니다.";

export type SavedExportResult = { json: string; markdown: string; fileBase: string; count: number };

/** 문항 목록에 내 풀이·저장·메모를 붙여 내보내기 행으로 */
async function rowsFor(deps: LearningDeps, userId: string, questions: QuizQuestion[]): Promise<ExportRow[]> {
  const ids = questions.map((q) => q.id);
  const [attempts, saved, notes] = await Promise.all([deps.attempts.listForQuestions(userId, ids), deps.marks.listMarked(userId, ids, "saved"), deps.notes.forQuestions(userId, ids)]);
  const byQ = new Map<string, typeof attempts>();
  for (const a of attempts) byQ.set(a.questionId, [...(byQ.get(a.questionId) ?? []), a]);
  const savedSet = new Set(saved);
  return questions.map((q) => ({ q, r: buildRecord(byQ.get(q.id) ?? [], savedSet.has(q.id), notes.get(q.id) ?? null) }));
}

export type ExportSavedBoxInput = { subjectId: string; questionIds: string[]; filterLabel: string | null };

/**
 * 저장함 내보내기: 고른 문항들의 원문과 내 기록을 JSON·Markdown 문자열로.
 * Catalog 가 RLS 로 거르므로 볼 수 없는 과목의 문항은 빠진다. 다른 사람 기록은 섞이지 않는다.
 */
export async function exportSavedBox(deps: LearningDeps, input: ExportSavedBoxInput): Promise<Result<SavedExportResult>> {
  if (!deps.user) return err(LOGIN);
  const ids = [...new Set(input.questionIds)].slice(0, 2000);
  if (ids.length === 0) return err("내보낼 문항이 없습니다.");
  try {
    const [subject, units, questions] = await Promise.all([deps.catalog.getSubject(input.subjectId), deps.catalog.listUnits(input.subjectId), deps.catalog.questionsByIds(ids)]);
    if (!subject) return err("과목을 찾을 수 없습니다.");
    const rows = await rowsFor(deps, deps.user.id, questions.filter((q) => q.subject_id === input.subjectId));
    const exportedAt = deps.clock.now();
    const out = buildSavedExport({ subjectName: subject.name, exportedAt, filterLabel: input.filterLabel, units, rows });
    return ok({ json: JSON.stringify(out.json, null, 2), markdown: out.markdown, fileBase: exportFileBase(subject.name, exportedAt), count: rows.length });
  } catch (e) {
    return err(msg(e));
  }
}

/**
 * 학습 요약 Markdown (출제·분석용): 단원·주제·난이도·함정별 표 + 약한 문항(틀림·헷갈림·저장) 많이 틀린 순 top 개.
 * MCP get_learning_summary 와 CLI 내보내기가 같이 쓴다.
 */
export async function learningSummary(deps: LearningDeps, subjectId: string, unitId: string | null = null, top = 60): Promise<Result<string>> {
  if (!deps.user) return err(LOGIN);
  try {
    const [subject, units, stats, scopeIds] = await Promise.all([
      deps.catalog.getSubject(subjectId),
      deps.catalog.listUnits(subjectId),
      deps.stats.questionStats(subjectId),
      deps.catalog.questionIds(unitId ? { kind: "units", subjectId, unitIds: [unitId] } : { kind: "subject", subjectId }),
    ]);
    if (!subject) return err("과목을 찾을 수 없거나 볼 권한이 없습니다.");
    const scope = new Set(scopeIds);
    const inScope: QuestionStat[] = stats.filter((s) => scope.has(s.questionId));
    const weak = savedBoxFilter(inScope, "weak");
    const picked = weak.slice(0, Math.max(0, top));
    const questions = await deps.catalog.questionsByIds(picked.map((s) => s.questionId));
    const rows = await rowsFor(deps, deps.user.id, questions);
    const unitTitle = unitId ? unitPathOf(units, unitId).join(" › ") || null : null;
    return ok(
      buildLearningSummary({
        subjectName: subject.name,
        exportedAt: deps.clock.now(),
        units,
        scopeQuestionCount: scopeIds.length,
        stats: inScope,
        weakTotal: weak.length,
        rows,
        unitTitle,
      }),
    );
  } catch (e) {
    return err(msg(e));
  }
}
