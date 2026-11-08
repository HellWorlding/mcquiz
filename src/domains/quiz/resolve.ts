import "server-only";
import { getQuestionsByIds, listQuestionIds } from "@/domains/questions/queries";
import { buildWeakMix, getSavedIds } from "@/domains/progress/queries";
import { hashString, shuffled } from "./shuffle";
import type { QuestionWithChoices } from "@/domains/shared/types";
import { createClient } from "@/domains/auth/supabase/server";
import { getCurrentUser } from "@/domains/auth/session";
import type { SessionAnswer } from "./actions";

export type QuizParams = {
  subject?: string;
  units?: string; // 쉼표 구분
  set?: string;
  collection?: string;
  mode?: "wrong" | "confused" | "saved" | "weakmix";
  count?: string; // 10 | 20 | 40 | all
  order?: "seq" | "random";
  offset?: string; // 순서대로일 때 시작 위치 (0부터)
  ids?: string; // 쉼표 구분 (다시 풀기)
  session?: string; // 이어서 풀기
};

export type ResumeState = { id: string; position: number; answers: Record<string, SessionAnswer> };

export type ResolvedQuiz = {
  questions: QuestionWithChoices[];
  total: number;
  title: string;
  /** 선지 셔플 seed (렌더 밖에서 만든다) */
  seed: number;
  /** 이어서 풀기일 때 저장된 진행 상태 */
  resume: ResumeState | null;
};

export async function resolveQuiz(p: QuizParams): Promise<ResolvedQuiz> {
  const seed = Date.now() & 0xffff;
  let ids: string[] = [];
  let title = "퀴즈";

  if (p.session) {
    const user = await getCurrentUser();
    if (user) {
      const db = await createClient();
      const { data: ses } = await db.from("quiz_sessions").select("*").eq("id", p.session).maybeSingle();
      if (ses) {
        const qs = await getQuestionsByIds(ses.question_ids);
        return {
          questions: qs,
          total: qs.length,
          title: ses.title,
          seed: hashString(ses.id) & 0xffff, // 같은 세션은 같은 선지 순서
          resume: { id: ses.id, position: Math.min(ses.position, Math.max(0, qs.length - 1)), answers: (ses.answers ?? {}) as Record<string, SessionAnswer> },
        };
      }
    }
  }

  if (p.ids) {
    ids = p.ids.split(",").filter(Boolean);
    title = "다시 풀기";
  } else if (p.mode === "weakmix" && p.subject) {
    const n = p.count && p.count !== "all" ? Number(p.count) : 20;
    ids = await buildWeakMix(p.subject, n);
    title = "약점 섞어 풀기";
    const qs = await getQuestionsByIds(ids);
    return { questions: qs, total: qs.length, title, seed, resume: null };
  } else if ((p.mode === "wrong" || p.mode === "confused" || p.mode === "saved") && p.subject) {
    ids = await getSavedIds(p.subject, p.mode);
    title = p.mode === "wrong" ? "틀린 문제 다시 풀기" : p.mode === "confused" ? "헷갈린 문제 다시 풀기" : "저장된 문제 풀기";
  } else if (p.set) {
    ids = await listQuestionIds({ kind: "set", setId: p.set });
    title = "세트";
  } else if (p.collection) {
    ids = await listQuestionIds({ kind: "collection", collectionId: p.collection });
    title = "묶음";
  } else if (p.units && p.subject) {
    ids = await listQuestionIds({ kind: "units", subjectId: p.subject, unitIds: p.units.split(",").filter(Boolean) });
    title = "단원";
  } else if (p.subject) {
    ids = await listQuestionIds({ kind: "subject", subjectId: p.subject });
    title = "전체";
  }

  const total = ids.length;
  const order = p.order === "random" ? "random" : "seq";
  const count = p.count && p.count !== "all" ? Math.max(1, Number(p.count) || 20) : null;
  let picked = ids;
  if (order === "random") {
    picked = shuffled(ids, seed);
    if (count) picked = picked.slice(0, count);
  } else if (count) {
    const offset = Math.max(0, Number(p.offset) || 0);
    picked = ids.slice(offset, offset + count);
  }
  const questions = await getQuestionsByIds(picked);
  return { questions, total, title, seed, resume: null };
}
