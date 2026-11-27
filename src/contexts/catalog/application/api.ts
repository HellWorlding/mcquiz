import type { Result } from "@/shared/result";
import type { Collection, CollectionScope, Question, QuestionScope, QuestionSet, Subject, Unit, Visibility } from "../domain/types";
import type { TreeNode } from "../domain/tree";
import type { PreviewQuestion } from "../domain/import/types";
import * as subjects from "./subjects";
import * as units from "./units";
import * as questions from "./questions";
import * as collections from "./collections";
import * as imp from "./import";
import type { CatalogDeps } from "./ports";

/** 다른 컨텍스트가 쓰는 공개 API (PRD-04 §4 catalog). 모든 메서드는 deps 를 닫아 둔 use case 호출이다 */
export type CatalogApi = {
  listSubjects(): Promise<Subject[]>;
  getSubject(id: string): Promise<Subject | null>;
  listUnits(subjectId: string): Promise<Unit[]>;
  unitTree(subjectId: string): Promise<TreeNode<Unit>[]>;
  expandUnitIds(unitIds: string[]): Promise<string[]>;
  /** 단원 없는 문항은 "__none__" 키 */
  questionCountsByUnit(subjectId: string): Promise<Map<string, number>>;
  listSets(subjectId: string): Promise<QuestionSet[]>;
  getSet(id: string): Promise<QuestionSet | null>;
  listCollections(subjectId: string): Promise<Collection[]>;
  getCollection(id: string): Promise<Collection | null>;
  questionCountsByCollection(subjectId: string): Promise<Map<string, number>>;
  questionIds(scope: QuestionScope): Promise<string[]>;
  questionsByIds(ids: string[]): Promise<Question[]>;
  searchQuestions(subjectId: string, text: string, limit?: number): Promise<Pick<Question, "id" | "unitId" | "ord" | "prompt" | "topic">[]>;
  // admin
  createSubject(name: string, visibility: Visibility): Promise<Result<Subject>>;
  setSubjectVisibility(id: string, visibility: Visibility): Promise<Result<void>>;
  createUnit(input: { subjectId: string; parentId: string | null; title: string; no: number | null }): Promise<Result<Unit>>;
  bulkCreateUnits(input: { subjectId: string; parentId: string | null; prefix: string; from: number; to: number; suffix?: string }): Promise<Result<number>>;
  renameUnit(id: string, title: string): Promise<Result<void>>;
  moveUnit(id: string, direction: "up" | "down"): Promise<Result<void>>;
  deleteUnit(id: string): Promise<Result<void>>;
  setUnitPriority(id: string, priority: 1 | 2 | 3 | 4 | 5 | null): Promise<Result<void>>;
  updateQuestion(input: questions.UpdateQuestionInput): Promise<Result<void>>;
  updateChoice(questionId: string, ord: number, patch: { text?: string; explanation?: string | null }): Promise<Result<void>>;
  deleteQuestion(id: string): Promise<Result<void>>;
  deleteSet(id: string): Promise<Result<void>>;
  // 묶음(사용자)
  createCollection(input: { subjectId: string; parentId: string | null; title: string; scope: CollectionScope }): Promise<Result<Collection>>;
  renameCollection(id: string, title: string): Promise<Result<void>>;
  deleteCollection(id: string): Promise<Result<void>>;
  addToCollection(id: string, questionIds: string[]): Promise<Result<number>>;
  removeFromCollection(id: string, questionId: string): Promise<Result<void>>;
  myCollections(subjectId: string): Promise<Result<Collection[]>>;
  // 반입
  previewImport(input: imp.PreviewImportInput): Promise<Result<imp.ImportPreview>>;
  commitImport(input: { subjectId: string; title: string; sourceFilename: string | null; questions: PreviewQuestion[] }): Promise<Result<imp.SaveSummary>>;
  /** 외부(MCP) 반입: check 는 검사만, commit 은 저장 */
  importQuestions(input: { questions: unknown[]; mode: "check" | "commit"; setTitle?: string }): Promise<Result<imp.ImportReport>>;
  authoringGuide(subjectId?: string): Promise<string>;
};

export function makeApi(deps: CatalogDeps): CatalogApi {
  return {
    listSubjects: () => subjects.listSubjects(deps),
    getSubject: (id) => subjects.getSubject(deps, id),
    listUnits: (s) => units.listUnits(deps, s),
    unitTree: (s) => units.unitTree(deps, s),
    expandUnitIds: (ids) => units.expandUnitIds(deps, ids),
    questionCountsByUnit: (s) => units.questionCountsByUnit(deps, s),
    listSets: (s) => questions.listSets(deps, s),
    getSet: (id) => questions.getSet(deps, id),
    listCollections: (s) => collections.listCollections(deps, s),
    getCollection: (id) => collections.getCollection(deps, id),
    questionCountsByCollection: (s) => collections.questionCountsByCollection(deps, s),
    questionIds: (scope) => questions.questionIds(deps, scope),
    questionsByIds: (ids) => questions.questionsByIds(deps, ids),
    searchQuestions: (s, text, limit) => questions.searchQuestions(deps, s, text, limit),
    createSubject: (name, v) => subjects.createSubject(deps, name, v),
    setSubjectVisibility: (id, v) => subjects.setSubjectVisibility(deps, id, v),
    createUnit: (input) => units.createUnit(deps, input),
    bulkCreateUnits: (input) => units.bulkCreateUnits(deps, input),
    renameUnit: (id, title) => units.renameUnit(deps, id, title),
    moveUnit: (id, dir) => units.moveUnit(deps, id, dir),
    deleteUnit: (id) => units.deleteUnit(deps, id),
    setUnitPriority: (id, p) => units.setUnitPriority(deps, id, p),
    updateQuestion: (input) => questions.updateQuestion(deps, input),
    updateChoice: (qid, ord, patch) => questions.updateChoice(deps, qid, ord, patch),
    deleteQuestion: (id) => questions.deleteQuestion(deps, id),
    deleteSet: (id) => questions.deleteSet(deps, id),
    createCollection: (input) => collections.createCollection(deps, input),
    renameCollection: (id, title) => collections.renameCollection(deps, id, title),
    deleteCollection: (id) => collections.deleteCollection(deps, id),
    addToCollection: (id, ids) => collections.addToCollection(deps, id, ids),
    removeFromCollection: (id, qid) => collections.removeFromCollection(deps, id, qid),
    myCollections: (s) => collections.myCollections(deps, s),
    previewImport: (input) => imp.previewImport(deps, input),
    commitImport: (input) => imp.commitImport(deps, input),
    importQuestions: (input) => imp.importQuestions(deps, input),
    authoringGuide: (s) => imp.authoringGuide(deps, s),
  };
}
