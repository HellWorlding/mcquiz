"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Subject, Unit } from "@/domains/shared/types";
import { flattenTree, type TreeNode } from "@/domains/shared/tree";
import Link from "next/link";
import { previewImportAction, saveImportAction, type PreviewResult, type SaveSummary } from "@/domains/import/actions";
import type { PreviewQuestion } from "@/domains/import/types";
import { LOW_CONFIDENCE } from "@/domains/import/types";
import { QuestionBadges, SourceQuote } from "@/domains/shared/components/QuestionMeta";

type Props = { subjects: Subject[]; currentSubjectId: string; unitTree: TreeNode<Unit>[] };

export function UploadWizard({ subjects, currentSubjectId, unitTree }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [questions, setQuestions] = useState<PreviewQuestion[]>([]);
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState<SaveSummary | null>(null);
  const units = useMemo(() => flattenTree(unitTree), [unitTree]);
  const unitLabel = (id: string | null) => {
    const u = units.find((x) => x.id === id);
    return u ? `${"　".repeat(u.depth)}${u.no !== null ? `${u.no}. ` : ""}${u.title}` : "(단원 없음)";
  };

  const onPreview = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const r = await previewImportAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPreview(r.data);
      setQuestions(r.data.questions);
      setTitle(r.data.suggestedTitle);
      window.scrollTo({ top: 0 });
    });
  };

  const onSave = () => {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const r = await saveImportAction({ subjectId: currentSubjectId, title, sourceFilename: preview.sourceFilename, questions });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(r.data);
      window.scrollTo({ top: 0 });
    });
  };

  const update = (key: string, patch: Partial<PreviewQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  if (saved) {
    return (
      <div className="card flex flex-col gap-3">
        <h1 className="text-xl font-bold">저장 완료</h1>
        <p>
          새로 {saved.inserted}문항, 덮어씀 {saved.updated}문항{saved.failed.length > 0 && `, 실패 ${saved.failed.length}문항`}
        </p>
        {saved.failed.length > 0 && (
          <div className="rounded-xl bg-bad-soft p-3 text-sm">
            <div className="mb-1 font-semibold text-bad">저장하지 못한 문항</div>
            <ul className="list-disc pl-5">
              {saved.failed.map((f) => (
                <li key={f.index}>
                  #{f.index + 1} {f.reason} — {f.prompt.slice(0, 60)}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {saved.setId && (
            <Link href={`/admin/sets/${saved.setId}`} className="btn-primary">
              세트 보기
            </Link>
          )}
          <Link href={`/subjects/${currentSubjectId}`} className="btn-secondary">
            풀러 가기
          </Link>
          <button
            className="btn-ghost"
            onClick={() => {
              setSaved(null);
              setPreview(null);
            }}
          >
            다른 파일 올리기
          </button>
        </div>
      </div>
    );
  }

  if (preview) {
    const needsReview = questions.filter((q) => q.correct === null).length;
    const lowUnit = questions.filter((q) => q.unitConfidence !== null && q.unitConfidence < LOW_CONFIDENCE).length;
    return (
      <div className="flex flex-col gap-4">
        <div className="card flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">미리보기 · {questions.length}문항</h1>
            <button className="btn-ghost btn-sm" onClick={() => setPreview(null)}>
              ← 다시 올리기
            </button>
          </div>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="세트 이름" />
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="badge bg-accent-soft text-accent">형식: {preview.format}</span>
            {Object.entries(preview.subjectOverrides ?? {}).map(([name, n]) => (
              <span key={name} className="badge bg-ok-soft text-ok">
                파일 지정 주제 &quot;{name}&quot; {n}문항
              </span>
            ))}
            {needsReview > 0 && <span className="badge bg-warn-soft text-warn">정답 없음 {needsReview}</span>}
            {lowUnit > 0 && <span className="badge bg-warn-soft text-warn">단원 확인 필요 {lowUnit}</span>}
          </div>
          {preview.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-warn">
              {preview.warnings.slice(0, 10).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-bad">{error}</p>}
          <button className="btn-primary" onClick={onSave} disabled={pending || questions.length === 0}>
            {pending ? "저장 중…" : `저장 (${questions.length}문항)`}
          </button>
        </div>

        {questions.map((q, i) => (
          <QuestionCard key={q.key} q={q} index={i} units={units} unitLabel={unitLabel} onChange={(p) => update(q.key, p)} onDelete={() => setQuestions((qs) => qs.filter((x) => x.key !== q.key))} />
        ))}
        <button className="btn-primary" onClick={onSave} disabled={pending || questions.length === 0}>
          {pending ? "저장 중…" : `저장 (${questions.length}문항)`}
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onPreview(new FormData(e.currentTarget));
      }}
    >
      <h1 className="text-2xl font-bold">문제 업로드</h1>
      <div className="card flex flex-col gap-3">
        <div>
          <label className="label">주제</label>
          <select name="subject_id" className="input" value={currentSubjectId} onChange={(e) => router.push(`/admin/upload?subject=${e.target.value}`)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">단원 배정</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select name="assign_mode" className="input sm:w-48" defaultValue="auto">
              <option value="auto">자동 분류</option>
              <option value="manual">아래 단원에 모두 넣기</option>
            </select>
            <select name="target_unit_id" className="input" defaultValue="">
              <option value="">(전체 단원에서 자동 분류)</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {unitLabel(u.id)}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-xs text-muted">자동 분류일 때 단원을 고르면 그 단원의 하위 단원 안에서만 고릅니다.</p>
        </div>
        <div>
          <label className="label">파일 (JSON · txt · md · pdf, 여러 개 가능. 이름에 &quot;정답&quot;/&quot;해설&quot;이 있으면 정답지로 취급)</label>
          <input name="files" type="file" multiple accept=".json,.txt,.md,.pdf,text/plain,application/json,application/pdf" className="input" />
        </div>
        <div>
          <label className="label">또는 문제 텍스트 붙여넣기</label>
          <textarea name="text" className="input min-h-48 font-mono text-sm" placeholder={"1. 문서관리 업무의 범위가 아닌 것은?\n1 기안\n2 공람\n3 발송함\n4 과제카드"} />
        </div>
        <div>
          <label className="label">정답·해설 텍스트 (선택)</label>
          <textarea name="answer_text" className="input min-h-24 font-mono text-sm" placeholder={"1. 정답: 4번\n  4) 과제카드는 …"} />
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button className="btn-primary" disabled={pending}>
          {pending ? "분석 중…" : "미리보기"}
        </button>
      </div>
    </form>
  );
}

function QuestionCard({
  q,
  index,
  units,
  unitLabel,
  onChange,
  onDelete,
}: {
  q: PreviewQuestion;
  index: number;
  units: TreeNode<Unit>[];
  unitLabel: (id: string | null) => string;
  onChange: (p: Partial<PreviewQuestion>) => void;
  onDelete: () => void;
}) {
  const low = q.unitConfidence !== null && q.unitConfidence < LOW_CONFIDENCE;
  const setChoice = (i: number, patch: Partial<PreviewQuestion["choices"][number]>) =>
    onChange({ choices: q.choices.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <div className={`card flex flex-col gap-2 ${q.correct === null ? "border-warn" : ""}`}>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          #{index + 1} {q.no !== null && `(원문 ${q.no}번)`} {q.unitHint !== null && `· ${q.unitHint}강 표시`}
        </span>
        <button className="btn-ghost btn-sm text-bad" onClick={onDelete}>
          제외
        </button>
      </div>
      <QuestionBadges q={{ difficulty: q.difficulty, topic: q.topic, trap_types: q.trapTypes, source_quote: q.sourceQuote }} />
      <textarea className="input font-semibold" value={q.prompt} onChange={(e) => onChange({ prompt: e.target.value })} rows={2} />
      <SourceQuote q={{ difficulty: q.difficulty, topic: q.topic, trap_types: q.trapTypes, source_quote: q.sourceQuote }} />
      <ul className="flex flex-col gap-2">
        {q.choices.map((c, i) => (
          <li key={i} className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onChange({ correct: i + 1 })}
                className={`mt-1 size-8 shrink-0 rounded-full border-2 text-sm font-bold ${q.correct === i + 1 ? "border-ok bg-ok-soft text-ok" : "border-border text-muted"}`}
                aria-label={`${i + 1}번을 정답으로`}
              >
                {i + 1}
              </button>
              <input className="input py-2" value={c.text} onChange={(e) => setChoice(i, { text: e.target.value })} />
            </div>
            <input
              className="input ml-10 w-auto py-1 text-sm"
              placeholder="해설 (선택)"
              value={c.explanation ?? ""}
              onChange={(e) => setChoice(i, { explanation: e.target.value || null })}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {q.choices.length < 5 && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => onChange({ choices: [...q.choices, { text: "", explanation: null }] })}>
            선지 추가 (5지선다)
          </button>
        )}
        {q.choices.length === 5 && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => onChange({ choices: q.choices.slice(0, 4), correct: q.correct === 5 ? null : q.correct })}
          >
            5번 선지 제거
          </button>
        )}
      </div>
      <textarea
        className="input py-2 text-sm"
        placeholder="문항 해설 (선택) — 선지별 해설과 별도로 전체를 정리하는 설명"
        rows={2}
        value={q.explanation ?? ""}
        onChange={(e) => onChange({ explanation: e.target.value || null })}
      />
      <input className="input py-2 text-sm" placeholder="힌트 (선택)" value={q.hint ?? ""} onChange={(e) => onChange({ hint: e.target.value || null })} />
      <div className="flex flex-wrap items-center gap-2">
        <select className={`input w-auto py-2 text-sm ${low ? "border-warn" : ""}`} value={q.unitId ?? ""} onChange={(e) => onChange({ unitId: e.target.value || null, unitConfidence: e.target.value ? 1 : null })}>
          <option value="">(단원 없음)</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {unitLabel(u.id)}
            </option>
          ))}
        </select>
        {low && <span className="badge bg-warn-soft text-warn">단원 확인 필요 ({Math.round((q.unitConfidence ?? 0) * 100)}%)</span>}
        {q.correct === null && <span className="badge bg-warn-soft text-warn">정답 없음 — 번호를 눌러 지정</span>}
        {q.warnings
          .filter((w) => !w.startsWith("정답이 없습니다"))
          .map((w, i) => (
            <span key={i} className="text-xs text-warn">
              {w}
            </span>
          ))}
      </div>
    </div>
  );
}
