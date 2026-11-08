"use client";
import { useEffect, useRef, useState } from "react";
import { saveNoteAction } from "@/domains/notes/actions";

/** 문항 메모 칸. 입력을 멈추면 자동 저장. */
export function NoteBox({
  questionId,
  initial,
  compact = false,
  importText,
}: {
  questionId: string;
  initial: string;
  compact?: boolean;
  /** "해설 가져오기" 로 메모에 붙여 넣을 글 */
  importText?: string | null;
}) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [open, setOpen] = useState(!!initial || !compact);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(initial);

  const flush = async (value: string) => {
    setState("saving");
    const r = await saveNoteAction(questionId, value);
    if (latest.current !== value) return; // 그 사이 더 입력됨
    setState(r.ok ? "saved" : "error");
  };

  const onChange = (value: string) => {
    setText(value);
    latest.current = value;
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(value), 800);
  };

  // 화면을 떠날 때 남은 입력을 저장
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void saveNoteAction(questionId, latest.current);
      }
    };
  }, [questionId]);

  if (compact && !open) {
    return (
      <button className="btn-ghost btn-sm self-start" onClick={() => setOpen(true)}>
        메모
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">메모</span>
        <span className="text-xs text-muted">
          {state === "saving" && "저장 중…"}
          {state === "saved" && "저장됨"}
          {state === "dirty" && "입력 중"}
          {state === "error" && <span className="text-bad">저장 실패</span>}
        </span>
      </div>
      {importText && !text.includes(importText.slice(0, 40)) && (
        <button type="button" className="btn-ghost btn-sm self-start" onClick={() => onChange(text ? `${text}\n\n${importText}` : importText)}>
          해설 가져오기
        </button>
      )}
      <textarea
        className="input min-h-20 text-base"
        placeholder="이 문제에 대한 메모 (자동 저장)"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (state === "dirty") {
            if (timer.current) clearTimeout(timer.current);
            void flush(latest.current);
          }
        }}
      />
    </div>
  );
}
