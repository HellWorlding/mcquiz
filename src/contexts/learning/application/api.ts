import type { Result } from "@/shared/result";
import type { LearningFilter, NoteItem, QuestionStat, QuizSession, RoundScore, SavedBoxSummary, SubjectActivity, UnfinishedSession, UnitAttemptCount, UnitProgressRow } from "../domain/types";
import type { LearningDeps } from "./ports";
import { assembleQuiz, deleteSession, getSession, listUnfinishedSessions, recordAttempt, saveProgress, toggleConfused, type AssembleQuizInput, type RecordAttemptInput, type SaveProgressInput } from "./quiz";
import { dismiss, markSaved, savedBox, savedBoxIds, savedBoxSummary, savedIdsFor, undismiss, type SavedBoxOptions, type SavedBoxRow } from "./saved-box";
import { listNotes, notesFor, saveNote } from "./notes";
import { questionStats, subjectActivity, unitAttemptCounts, unitProgress, unitRoundScores } from "./stats";
import { exportSavedBox, learningSummary, type ExportSavedBoxInput, type SavedExportResult } from "./export";

/** Learning 공개 API (PRD-04 §4). 다른 컨텍스트와 MCP 는 이 객체만 쓴다 */
export type LearningApi = {
  assembleQuiz(input: AssembleQuizInput): Promise<Result<string[]>>;
  recordAttempt(input: RecordAttemptInput): Promise<Result<string | null>>;
  toggleConfused(attemptId: string, confused: boolean): Promise<Result<void>>;
  saveProgress(input: SaveProgressInput): Promise<Result<string | null>>;
  deleteSession(id: string): Promise<Result<void>>;
  listUnfinishedSessions(subjectId: string): Promise<UnfinishedSession[]>;
  getSession(id: string): Promise<QuizSession | null>;
  markSaved(questionId: string, on: boolean): Promise<Result<void>>;
  dismiss(ids: string[]): Promise<Result<number>>;
  undismiss(ids: string[]): Promise<Result<number>>;
  savedIdsFor(questionIds: string[]): Promise<string[]>;
  saveNote(questionId: string, content: string): Promise<Result<"saved" | "deleted" | "guest">>;
  notesFor(questionIds: string[]): Promise<Map<string, string>>;
  listNotes(subjectId: string | null): Promise<NoteItem[]>;
  questionStats(subjectId: string): Promise<QuestionStat[]>;
  unitRoundScores(subjectId: string): Promise<RoundScore[]>;
  unitAttemptCounts(subjectId: string): Promise<UnitAttemptCount[]>;
  unitProgress(subjectId: string): Promise<UnitProgressRow[]>;
  subjectActivity(): Promise<SubjectActivity[]>;
  savedBox(subjectId: string, filter: LearningFilter, opts?: SavedBoxOptions): Promise<SavedBoxRow[]>;
  /** 본문 없이 id 만 (쪽 나누기용). 많이 틀린 순 */
  savedBoxIds(subjectId: string, filter: LearningFilter, opts?: SavedBoxOptions): Promise<string[]>;
  savedBoxSummary(subjectId: string): Promise<SavedBoxSummary | null>;
  exportSavedBox(input: ExportSavedBoxInput): Promise<Result<SavedExportResult>>;
  learningSummary(subjectId: string, unitId?: string | null, top?: number): Promise<Result<string>>;
};

export function learningApiFrom(deps: LearningDeps): LearningApi {
  return {
    assembleQuiz: (input) => assembleQuiz(deps, input),
    recordAttempt: (input) => recordAttempt(deps, input),
    toggleConfused: (id, c) => toggleConfused(deps, id, c),
    saveProgress: (input) => saveProgress(deps, input),
    deleteSession: (id) => deleteSession(deps, id),
    listUnfinishedSessions: (s) => listUnfinishedSessions(deps, s),
    getSession: (id) => getSession(deps, id),
    markSaved: (q, on) => markSaved(deps, q, on),
    dismiss: (ids) => dismiss(deps, ids),
    undismiss: (ids) => undismiss(deps, ids),
    savedIdsFor: (ids) => savedIdsFor(deps, ids),
    saveNote: (q, c) => saveNote(deps, q, c),
    notesFor: (ids) => notesFor(deps, ids),
    listNotes: (s) => listNotes(deps, s),
    questionStats: (s) => questionStats(deps, s),
    unitRoundScores: (s) => unitRoundScores(deps, s),
    unitAttemptCounts: (s) => unitAttemptCounts(deps, s),
    unitProgress: (s) => unitProgress(deps, s),
    subjectActivity: () => subjectActivity(deps),
    savedBox: (s, f, o) => savedBox(deps, s, f, o),
    savedBoxIds: async (s, f, o) => (await savedBoxIds(deps, s, f, o)).ids,
    savedBoxSummary: (s) => savedBoxSummary(deps, s),
    exportSavedBox: (input) => exportSavedBox(deps, input),
    learningSummary: (s, u, top) => learningSummary(deps, s, u ?? null, top),
  };
}
