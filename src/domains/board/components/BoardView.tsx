"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BoardPost } from "@/domains/board/queries";
import { adminUpdatePostAction, createPostAction, deletePostAction } from "@/domains/board/actions";
import { useT } from "@/domains/shared/i18n-client";

const KINDS = ["bug", "idea", "praise", "other"] as const;
const STATUSES = ["open", "progress", "done"] as const;

export function BoardView({
  posts,
  page,
  pages,
  total,
  userId,
  isAdmin,
  adminEmail,
}: {
  posts: BoardPost[];
  page: number;
  pages: number;
  total: number;
  userId: string;
  isAdmin: boolean;
  adminEmail: string;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<string>("idea");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});

  const kindLabel = (k: string) => t(`board.kind_${k}` as "board.kind_bug");
  const statusLabel = (s: string) => t(`board.status_${s}` as "board.status_open");

  const create = () =>
    startTransition(async () => {
      setError(null);
      const r = await createPostAction({ kind, title, body });
      if (!r.ok) setError(r.error);
      else {
        setTitle("");
        setBody("");
        setShowForm(false);
        router.refresh();
      }
    });

  // 페이지 번호 5개 묶음
  const groupStart = Math.floor((page - 1) / 5) * 5 + 1;
  const groupEnd = Math.min(groupStart + 4, pages);
  const nums = Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{t("board.title")}</h1>
          <p className="text-sm text-muted">
            {t("board.desc")} <a className="underline" href={`mailto:${adminEmail}`}>{adminEmail}</a>
          </p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {t("board.write")}
        </button>
      </div>

      {showForm && (
        <div className="card flex flex-col gap-2">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
          <input className="input" maxLength={80} placeholder={t("board.title_ph")} value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} />
          <textarea className="input min-h-28" maxLength={500} placeholder={t("board.body_ph")} value={body} onChange={(e) => setBody(e.target.value.slice(0, 500))} />
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {title.length}/80 · {body.length}/500
            </span>
            {error && <span className="text-bad">{error}</span>}
          </div>
          <button className="btn-primary" disabled={pending || !title.trim() || !body.trim()} onClick={create}>
            {pending ? t("auth.processing") : t("board.submit")}
          </button>
        </div>
      )}

      {posts.length === 0 ? (
        <p className="card text-muted">{t("board.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {posts.map((p) => (
            <li key={p.id} className="card">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="badge bg-accent-soft text-accent">{kindLabel(p.kind)}</span>
                <span className={`badge ${p.status === "done" ? "bg-ok-soft text-ok" : p.status === "progress" ? "bg-warn-soft text-warn" : "bg-background text-muted"}`}>
                  {statusLabel(p.status)}
                </span>
                <span className="text-muted">
                  {p.author} · {new Date(p.created_at).toLocaleDateString("ko-KR")}
                </span>
                {(p.user_id === userId || isAdmin) && (
                  <button
                    className="ml-auto text-bad"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await deletePostAction(p.id);
                        router.refresh();
                      })
                    }
                  >
                    {t("common.delete")}
                  </button>
                )}
              </div>
              <h2 className="mt-1 font-bold">{p.title}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm">{p.body}</p>
              {p.admin_reply && (
                <div className="mt-2 rounded-lg bg-background p-2 text-sm">
                  <span className="mr-1 text-xs font-semibold text-muted">{t("board.admin_reply")}</span>
                  <span className="whitespace-pre-wrap">{p.admin_reply}</span>
                </div>
              )}
              {isAdmin && (
                <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                  <div className="flex gap-1">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        className={`rounded-full border px-2 py-0.5 text-xs ${p.status === s ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await adminUpdatePostAction({ id: p.id, status: s });
                            router.refresh();
                          })
                        }
                      >
                        {statusLabel(s)}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      className="input py-1 text-sm"
                      placeholder={t("board.reply_ph")}
                      value={replyDraft[p.id] ?? p.admin_reply ?? ""}
                      onChange={(e) => setReplyDraft({ ...replyDraft, [p.id]: e.target.value })}
                    />
                    <button
                      className="btn-secondary btn-sm shrink-0"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await adminUpdatePostAction({ id: p.id, reply: replyDraft[p.id] ?? p.admin_reply ?? "" });
                          router.refresh();
                        })
                      }
                    >
                      {t("common.save")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-1 text-sm">
          {groupStart > 1 && (
            <Link href={`/board?page=${groupStart - 1}`} className="btn-ghost btn-sm">
              ‹
            </Link>
          )}
          {nums.map((n) => (
            <Link key={n} href={`/board?page=${n}`} className={`rounded-lg px-3 py-1 ${n === page ? "bg-accent text-white" : "hover:bg-accent-soft/40"}`}>
              {n}
            </Link>
          ))}
          {groupEnd < pages && (
            <Link href={`/board?page=${groupEnd + 1}`} className="btn-ghost btn-sm">
              ›
            </Link>
          )}
          <span className="ml-2 text-xs text-muted">{total}</span>
        </nav>
      )}
    </section>
  );
}
