// learning 컨텍스트 공개 API. 다른 컨텍스트와 src/app, scripts 는 이 파일만 import 한다.
export type {
  QuizScope,
  LearningFilter,
  QuizOrder,
  QuizCount,
  SessionAnswer,
  QuizSession,
  UnfinishedSession,
  ResumeState,
  Attempt,
  MarkKind,
  QuestionStat,
  RoundScore,
  UnitAttemptCount,
  UnitProgressRow,
  SubjectActivity,
  UnitRoundScores,
  UnitAttemptCounts,
  QuizChoice,
  QuizQuestion,
  LearningUnit,
  SavedItem,
  GroupStat,
  SavedBoxSummary,
  NoteItem,
} from "./domain/types";
export { LEARNING_FILTERS, isLearningFilter } from "./domain/types";
export { parseQuizParams, pickByOrder, type QuizSearchParams, type ParsedQuizParams } from "./domain/quiz";
export { roundScores, toUnitRoundScores, toUnitAttemptCounts } from "./domain/round-scores";
export { savedBoxFilter, savedBoxItems, matchesFilter, summarizeSavedBox, emptyStat } from "./domain/saved-box";
export { pickWeakMix } from "./domain/weak-mix";
export { shuffled, hashString, mulberry32 } from "./domain/shuffle";
export {
  buildSavedExport,
  exportFileBase,
  unitPathOf,
  buildRecord,
  recordFromStat,
  exportQuestionJson,
  SAVED_EXPORT_FORMAT,
  SAVED_EXPORT_VERSION,
  type ExportQuestion,
  type ExportRecord,
  type ExportRow,
  type ExportUnit,
  type SavedExportInput,
} from "./domain/export";
export { buildLearningSummary, type LearningSummaryInput } from "./domain/summary";

export type { LearningDeps, AttemptRepo, SessionRepo, MarkRepo, NoteRepo, StatsReadModel, CatalogQuestions, CatalogScope, Clock, Rng } from "./application/ports";
export type { LearningApi } from "./application/api";
export { learningApiFrom } from "./application/api";
export { assembleQuiz, resolveQuizIds, scopeTitle, recordAttempt, toggleConfused, saveProgress, deleteSession, listUnfinishedSessions, getSession, type AssembleQuizInput, type RecordAttemptInput, type SaveProgressInput } from "./application/quiz";
export { markSaved, dismiss, undismiss, savedIdsFor, savedBox, savedBoxIds, savedBoxQuestions, savedBoxSummary, type SavedBoxRow, type SavedBoxOptions } from "./application/saved-box";
export { saveNote, notesFor, listNotes } from "./application/notes";
export { questionStats, attemptCounts, unitRoundScores, unitRoundScoreMap, unitAttemptCounts, unitAttemptCountMap, unitProgress, subjectActivity } from "./application/stats";
export { exportSavedBox, learningSummary, type ExportSavedBoxInput, type SavedExportResult } from "./application/export";
