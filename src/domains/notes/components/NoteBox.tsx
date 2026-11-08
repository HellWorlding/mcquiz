"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveNoteAction } from "@/domains/notes/actions";

const FONT_KEY = "mcquiz.noteFontSize";
const FONT_MIN = 14;
const FONT_MAX = 32;
const FONT_DEFAULT = 19;
const FONT_EVENT = "mcquiz:noteFontSize";

/** 메모 글자 크기 (기기별 기억, 모든 메모 칸에 동시에 적용) */
export function useNoteFontSize() {
  const [size, setSize] = useState(FONT_DEFAULT);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(FONT_KEY));
      if (v >= FONT_MIN && v <= FONT_MAX) setSize(v);
    } catch {}
    const onChange = (e: Event) => setSize((e as CustomEvent<number>).detail);
    window.addEventListener(FONT_EVENT, onChange);
    return () => window.removeEventListener(FONT_EVENT, onChange);
  }, []);
  const change = useCallback((delta: number) => {
    setSize((s) => {
      const next = Math.max(FONT_MIN, Math.min(FONT_MAX, s + delta));
      try {
        localStorage.setItem(FONT_KEY, String(next));
      } catch {}
      window.dispatchEvent(new CustomEvent(FONT_EVENT, { detail: next }));
      return next;
    });
  }, []);
  return { size, change };
}

export function FontSizeControl() {
  const { size, change } = useNoteFontSize();
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted">
      <button type="button" className="btn-secondary btn-sm px-2" onClick={() => change(-2)} aria-label="글자 작게">
        A−
      </button>
      <span className="w-8 text-center text-xs">{size}</span>
      <button type="button" className="btn-secondary btn-sm px-2" onClick={() => change(2)} aria-label="글자 크게">
        A+
      </button>
    </span>
  );
}

/** 문항 메모 칸. 입력을 멈추면 자동 저장. 내용만큼 늘어나고 안쪽 스크롤이 없다. */
export function NoteBox({
  questionId,
  initial,
  compact = false,
  importText,
  showFontControl = true,
}: {
  questionId: string;
  initial: string;
  compact?: boolean;
  /** "해설 가져오기" 로 메모에 붙여 넣을 글 */
  importText?: string | null;
  showFontControl?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [open, setOpen] = useState(!!initial || !compact);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(initial);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const { size } = useNoteFontSize();

  const autosize = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
  }, []);
  useEffect(() => {
    autosize();
  }, [text, size, open, autosize]);

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

  const canImport = !!importText && !text.includes(importText.slice(0, 40));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted">메모</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          {state === "saving" && "저장 중…"}
          {state === "saved" && "저장됨"}
          {state === "dirty" && "입력 중"}
          {state === "error" && <span className="text-bad">저장 실패</span>}
          {showFontControl && <FontSizeControl />}
        </span>
      </div>
      {canImport && (
        <button type="button" className="btn-ghost btn-sm self-start" onClick={() => onChange(text ? `${text}\n\n${importText}` : importText!)}>
          해설·근거 가져오기
        </button>
      )}
      <textarea
        ref={areaRef}
        rows={2}
        className="input resize-none overflow-hidden leading-relaxed"
        style={{ fontSize: `${size}px`, minHeight: "3.5em" }}
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
