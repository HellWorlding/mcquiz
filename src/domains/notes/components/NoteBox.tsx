"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { saveNoteAction } from "@/domains/notes/actions";
import { useT } from "@/domains/shared/i18n-client";

const FONT_KEY = "mcquiz.noteFontSize";
const FONT_MIN = 14;
const FONT_MAX = 32;
const FONT_DEFAULT = 19;

// 글자 크기 저장소 (기기별 기억, 모든 메모 칸에 동시에 적용)
let fontSize: number | null = null;
const listeners = new Set<() => void>();
function readFontSize(): number {
  if (fontSize !== null) return fontSize;
  let v = FONT_DEFAULT;
  try {
    const stored = Number(localStorage.getItem(FONT_KEY));
    if (stored >= FONT_MIN && stored <= FONT_MAX) v = stored;
  } catch {}
  fontSize = v;
  return v;
}
function writeFontSize(v: number) {
  fontSize = v;
  try {
    localStorage.setItem(FONT_KEY, String(v));
  } catch {}
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 메모 글자 크기 */
export function useNoteFontSize() {
  const size = useSyncExternalStore(subscribe, readFontSize, () => FONT_DEFAULT);
  const change = useCallback((delta: number) => {
    writeFontSize(Math.max(FONT_MIN, Math.min(FONT_MAX, readFontSize() + delta)));
  }, []);
  return { size, change };
}

export function FontSizeControl() {
  const { size, change } = useNoteFontSize();
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted">
      <button type="button" className="btn-secondary btn-sm px-2" onClick={() => change(-2)} aria-label={t("notes.font_small")}>
        A−
      </button>
      <span className="w-8 text-center text-xs">{size}</span>
      <button type="button" className="btn-secondary btn-sm px-2" onClick={() => change(2)} aria-label={t("notes.font_big")}>
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
  const t = useT();

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
        {t("quiz.memo")}
      </button>
    );
  }

  const canImport = !!importText && !text.includes(importText.slice(0, 40));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted">{t("quiz.memo")}</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          {state === "saving" && t("quiz.memo_saving")}
          {state === "saved" && t("quiz.memo_saved")}
          {state === "dirty" && t("quiz.memo_typing")}
          {state === "error" && <span className="text-bad">{t("quiz.memo_error")}</span>}
          {showFontControl && <FontSizeControl />}
        </span>
      </div>
      {canImport && (
        <button type="button" className="btn-ghost btn-sm self-start" onClick={() => onChange(text ? `${text}\n\n${importText}` : importText!)}>
          {t("quiz.memo_import")}
        </button>
      )}
      <textarea
        ref={areaRef}
        rows={2}
        className="input resize-none overflow-hidden leading-relaxed"
        style={{ fontSize: `${size}px`, minHeight: "3.5em" }}
        placeholder={t("quiz.memo_placeholder")}
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
