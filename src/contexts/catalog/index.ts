// catalog 컨텍스트 공개 API. 다른 컨텍스트와 src/app, scripts 는 이 파일만 import 한다.
export type { Subject, Unit, Choice, Question, QuestionSet, Collection, CollectionScope, Visibility, Difficulty, QuestionScope } from "./domain/types";
export type { TreeNode } from "./domain/tree";
export { buildTree, flattenTree, subtreeIds } from "./domain/tree";
export { unitPathOf, descendantIds, findUnitByNo, leafUnits } from "./domain/unit";
export { validateQuestion, validateQuestions, sortChoices, type FailedQuestion } from "./domain/question";
export { canEditCollection, resolveCollectionScope } from "./domain/collection";
export type { ParsedQuestion, ParseResult, PreviewQuestion } from "./domain/import/types";
export { LOW_CONFIDENCE } from "./domain/import/types";
export { parseJsonQuestions, looksLikeJson } from "./domain/import/parse-json";
export { parseQuestionText, mergeAnswerKey, unitNoFromFilename } from "./domain/import/parse-text";
export { normalizeTarget, normalizeSubjectName, normalizeUnitTitle, unitNoFromTitle, targetFromFilename } from "./domain/import/targets";
export { normalizePrompt } from "./domain/import/dedupe";
export { AUTHORING_GUIDE } from "./domain/import/authoring-guide";

export type { CatalogDeps, SubjectRepo, UnitRepo, QuestionRepo, SetRepo, CollectionRepo, AiParser, TextExtractor, QuestionInsert, ImportWrite, ImportWriteResult } from "./application/ports";
export type { CatalogApi } from "./application/api";
export { makeApi as makeCatalogApiFromDeps } from "./application/api";
export type { ImportPreview, SaveSummary, PreviewImportInput, ImportReport, SaveResult } from "./application/import";
export { previewImport, commitImport, importQuestions, authoringGuide, saveQuestionSet, classifyQuestion, ensureUnitPath, parseWithFallback } from "./application/import";
export { listSubjects, getSubject, createSubject, setSubjectVisibility } from "./application/subjects";
export { listUnits, unitTree, expandUnitIds, questionCountsByUnit, createUnit, bulkCreateUnits, renameUnit, moveUnit, deleteUnit, setUnitPriority } from "./application/units";
export { questionIds, questionsByIds, searchQuestions, listSets, listAllSets, getSet, updateQuestion, updateChoice, deleteQuestion, deleteSet, type UpdateQuestionInput } from "./application/questions";
export { listCollections, getCollection, questionCountsByCollection, myCollections, createCollection, renameCollection, deleteCollection, addToCollection, removeFromCollection } from "./application/collections";
