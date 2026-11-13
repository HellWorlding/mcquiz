"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useT } from "@/domains/shared/i18n-client";

export type ReaderChunk = { id: string; ord: number; page: number | null; content: string };

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 검색어 토큰을 노랗게 표시 */
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (tokens.length === 0) return <>{text}</>;
  const re = new RegExp(`(${tokens.map(escapeRe).join("|")})`, "gi");
  const lower = new Set(tokens.map((x) => x.toLowerCase()));
  return (
    <>
      {text.split(re).map((part, i) =>
        lower.has(part.toLowerCase()) ? (
          <mark key={i} className="rounded bg-warn-soft px-0.5 text-warn">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * 자료 원문 보기. 근거로 쓰인 조각(targetChunkId)을 강조하고 그 위치로 스크롤한다.
 * 책은 쪽수(p.N) 머리글을 끼워 넣어 어디쯤인지 보이게 한다.
 */
export function SourceReader({
  label,
  title,
  kind,
  subjectId,
  subjectName,
  unitTitle,
  pageRange,
  chunks,
  targetChunkId,
  tokens,
}: {
  label: string;
  title: string;
  kind: string;
  subjectId: string;
  subjectName: string | null;
  unitTitle: string | null;
  pageRange: string | null;
  chunks: ReaderChunk[];
  targetChunkId: string | null;
  tokens: string[];
}) {
  const t = useT();
  const targetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    targetRef.current?.scrollIntoView({ block: "center" });
  }, [targetChunkId]);

  // 책: 쪽수가 바뀌는 첫 조각에만 p.N 머리글을 단다
  const pageHeader = new Map<string, number>();
  if (kind === "book") {
    let last: number | null = null;
    for (const c of chunks) {
      if (c.page !== null && c.page !== last) pageHeader.set(c.id, c.page);
      if (c.page !== null) last = c.page;
    }
  }
  return (
    <article className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/subjects/${subjectId}`} className="btn-ghost btn-sm">
          {t("source.back")}
        </Link>
        <span className="text-muted">
          {subjectName}
          {unitTitle ? ` › ${unitTitle}` : ""}
        </span>
      </div>
      <div>
        <h1 className="text-xl font-bold">
          <span className={`badge mr-2 align-middle ${kind === "book" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}>{label}</span>
          {title}
        </h1>
        {pageRange && <p className="text-sm text-muted">p.{pageRange}</p>}
        {targetChunkId && <p className="mt-1 text-xs text-accent">{t("source.matched")}</p>}
      </div>
      <div className="card flex flex-col gap-2 text-base leading-relaxed">
        {chunks.map((c) => {
          const header = pageHeader.get(c.id);
          const isTarget = c.id === targetChunkId;
          return (
            <div key={c.id}>
              {header !== undefined && <div className="sticky top-14 z-10 -mx-2 mb-1 border-b border-border bg-card/95 px-2 py-1 text-xs font-semibold text-muted backdrop-blur">{t("source.page", { n: header })}</div>}
              <div
                ref={isTarget ? targetRef : undefined}
                className={`whitespace-pre-wrap rounded-lg px-2 py-1 scroll-mt-24 ${isTarget ? "bg-accent-soft/40 ring-2 ring-accent" : ""}`}
              >
                <Highlight text={c.content} tokens={isTarget || tokens.length <= 3 ? tokens : []} />
              </div>
            </div>
          );
        })}
        {chunks.length === 0 && <p className="text-muted">{t("source.not_found")}</p>}
      </div>
    </article>
  );
}
