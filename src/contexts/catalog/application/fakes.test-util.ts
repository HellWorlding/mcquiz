import type { CurrentUser } from "@/contexts/access";
import type { Collection, Question, QuestionSet, Subject, Unit } from "../domain/types";
import type { CatalogDeps, QuestionInsert } from "./ports";

export const admin: CurrentUser = { id: "admin", email: "a@x", displayName: null, isAdmin: true, aiLimit: null };
export const user: CurrentUser = { id: "user", email: "u@x", displayName: null, isAdmin: false, aiLimit: null };

/** 인메모리 가짜 포트. 리포지토리 동작을 단순화한 것으로, use case 흐름만 검증한다 */
export function fakeDeps(current: CurrentUser | null, seed: { subjects?: Subject[]; units?: Unit[]; questions?: Question[]; sets?: QuestionSet[]; collections?: Collection[] } = {}) {
  let seq = 0;
  const id = (p: string) => `${p}${++seq}`;
  const subjects = [...(seed.subjects ?? [])];
  const units = [...(seed.units ?? [])];
  const questions = [...(seed.questions ?? [])];
  const sets = [...(seed.sets ?? [])];
  const collections = [...(seed.collections ?? [])];
  const items: { collectionId: string; questionId: string }[] = [];
  const classifyScores = new Map<string, { unitId: string; score: number }[]>();

  const fromInsert = (qid: string, setId: string | null, ord: number, q: QuestionInsert): Question => ({
    id: qid,
    subjectId: q.subjectId,
    unitId: q.unitId,
    setId,
    ord,
    prompt: q.prompt,
    choices: q.choices,
    correctChoice: q.correct,
    explanation: q.explanation,
    hint: q.hint,
    topic: q.topic,
    difficulty: q.difficulty,
    trapTypes: q.trapTypes,
    tags: q.tags,
    points: q.points,
    needsReview: q.correct === null,
    unitConfidence: q.unitConfidence,
    sourceQuote: q.sourceQuote,
    sourcePage: q.sourcePage,
  });

  const deps: CatalogDeps = {
    user: current,
    ai: null,
    extractText: async (_n, bytes) => new TextDecoder().decode(bytes),
    subjects: {
      list: async ({ publicOnly }) => subjects.filter((s) => !publicOnly || s.visibility === "public"),
      byId: async (sid, { publicOnly }) => subjects.find((s) => s.id === sid && (!publicOnly || s.visibility === "public")) ?? null,
      byName: async (name) => subjects.find((s) => s.name === name) ?? null,
      create: async (name, visibility) => {
        const s: Subject = { id: id("s"), name, visibility, createdAt: "" };
        subjects.push(s);
        return s;
      },
      setVisibility: async (sid, v) => void (subjects.find((s) => s.id === sid)!.visibility = v),
    },
    units: {
      list: async (sid) => units.filter((u) => u.subjectId === sid),
      byId: async (uid) => units.find((u) => u.id === uid) ?? null,
      insert: async (r) => {
        // C3: 같은 부모 아래 같은 no 는 unique 위반
        if (r.no !== null && units.some((u) => u.subjectId === r.subjectId && u.parentId === r.parentId && u.no === r.no)) throw new Error("duplicate key (parent_id, no)");
        const u: Unit = { id: id("u"), ...r, priority: null };
        units.push(u);
        return u;
      },
      insertMany: async (rows) => {
        for (const r of rows) if (!units.some((u) => u.subjectId === r.subjectId && u.parentId === r.parentId && u.no === r.no)) units.push({ id: id("u"), ...r, priority: null });
      },
      update: async (uid, patch) => void Object.assign(units.find((u) => u.id === uid)!, patch),
      delete: async (uid) => {
        units.splice(units.findIndex((u) => u.id === uid), 1);
        for (const q of questions) if (q.unitId === uid) q.unitId = null; // C4
      },
      subtree: async (roots) => {
        const out: string[] = [];
        for (const r of roots) {
          const stack = [r];
          while (stack.length) {
            const cur = stack.shift()!;
            if (!out.includes(cur)) out.push(cur);
            stack.push(...units.filter((u) => u.parentId === cur).map((u) => u.id));
          }
        }
        return out;
      },
      questionCounts: async (sid) => {
        const m = new Map<string | null, number>();
        for (const q of questions) if (q.subjectId === sid) m.set(q.unitId, (m.get(q.unitId) ?? 0) + 1);
        return [...m].map(([unitId, n]) => ({ unitId, n }));
      },
      classify: async (sid) => classifyScores.get(sid) ?? [],
    },
    questions: {
      byIds: async (ids) => questions.filter((q) => ids.includes(q.id)),
      idsBySet: async (setId) => questions.filter((q) => q.setId === setId).sort((a, b) => a.ord - b.ord).map((q) => q.id),
      idsInUnits: async (sid, unitIds) =>
        questions
          .filter((q) => q.subjectId === sid && q.unitId && unitIds.includes(q.unitId))
          .sort((a, b) => (a.setId ?? "").localeCompare(b.setId ?? "") || a.ord - b.ord)
          .map((q) => ({ id: q.id, unitId: q.unitId })),
      idsInSubject: async (sid) => questions.filter((q) => q.subjectId === sid).sort((a, b) => (a.setId ?? "").localeCompare(b.setId ?? "") || a.ord - b.ord).map((q) => q.id),
      search: async (sid, text, limit) => questions.filter((q) => q.subjectId === sid && (q.prompt.includes(text) || q.explanation?.includes(text))).slice(0, limit),
      findByPrompts: async (sid, prompts) => questions.filter((q) => q.subjectId === sid && prompts.includes(q.prompt)).map((q) => ({ id: q.id, unitId: q.unitId, prompt: q.prompt })),
      findBySets: async (setIds) => questions.filter((q) => q.setId && setIds.includes(q.setId)).map((q) => ({ id: q.id, unitId: q.unitId, ord: q.ord })),
      sampleOf: async (sid) => questions.find((q) => q.subjectId === sid) ?? null,
      update: async (qid, patch) => void Object.assign(questions.find((q) => q.id === qid)!, patch),
      updateChoice: async (qid, ord, patch) => void Object.assign(questions.find((q) => q.id === qid)!.choices.find((c) => c.ord === ord)!, patch),
      delete: async (qid) => void questions.splice(questions.findIndex((q) => q.id === qid), 1),
      overwrite: async (qid, q) => {
        const i = questions.findIndex((x) => x.id === qid);
        questions[i] = fromInsert(qid, questions[i].setId, questions[i].ord, q);
      },
      insertIntoSet: async (setId, rows) => {
        for (const r of rows) questions.push(fromInsert(id("q"), setId, r.ord, r));
      },
      setIdOf: async (qid) => questions.find((q) => q.id === qid)?.setId ?? null,
    },
    sets: {
      list: async (sid) => sets.filter((s) => s.subjectId === sid).map((s) => ({ ...s, questionCount: questions.filter((q) => q.setId === s.id).length })),
      listAll: async () => sets,
      byId: async (sid) => sets.find((s) => s.id === sid) ?? null,
      idsBySourceFilename: async (sid, f) => sets.filter((s) => s.subjectId === sid && s.sourceFilename === f).map((s) => s.id),
      create: async (r) => {
        const s: QuestionSet = { id: id("set"), subjectId: r.subjectId, title: r.title, sourceFilename: r.sourceFilename, createdBy: r.createdBy, createdAt: "" };
        sets.push(s);
        return s.id;
      },
      delete: async (sid) => {
        sets.splice(sets.findIndex((s) => s.id === sid), 1);
        for (let i = questions.length - 1; i >= 0; i--) if (questions[i].setId === sid) questions.splice(i, 1); // C5
      },
    },
    collections: {
      list: async (sid) => collections.filter((c) => c.subjectId === sid),
      byId: async (cid) => collections.find((c) => c.id === cid) ?? null,
      allRefs: async () => collections.map((c) => ({ id: c.id, parentId: c.parentId })),
      itemIds: async (ids) => items.filter((i) => ids.includes(i.collectionId)).map((i) => i.questionId),
      itemCounts: async (sid) => {
        const m = new Map<string, number>();
        for (const i of items) if (collections.find((c) => c.id === i.collectionId)?.subjectId === sid) m.set(i.collectionId, (m.get(i.collectionId) ?? 0) + 1);
        return m;
      },
      create: async (r) => {
        const c: Collection = { id: id("c"), subjectId: r.subjectId, parentId: r.parentId, title: r.title, sort: collections.length + 1, scope: r.scope, createdBy: r.createdBy };
        collections.push(c);
        return c;
      },
      rename: async (cid, title) => void (collections.find((c) => c.id === cid)!.title = title),
      delete: async (cid) => void collections.splice(collections.findIndex((c) => c.id === cid), 1),
      addItems: async (cid, qids) => {
        for (const q of qids) if (!items.some((i) => i.collectionId === cid && i.questionId === q)) items.push({ collectionId: cid, questionId: q });
      },
      removeItem: async (cid, qid) => void items.splice(items.findIndex((i) => i.collectionId === cid && i.questionId === qid), 1),
    },
  };
  return { deps, subjects, units, questions, sets, collections, items, classifyScores };
}

export const unit = (id: string, subjectId: string, parentId: string | null, no: number | null, title: string, sort = no ?? 1): Unit => ({ id, subjectId, parentId, no, title, sort, priority: null });
