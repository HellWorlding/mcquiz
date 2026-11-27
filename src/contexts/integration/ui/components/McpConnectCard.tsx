"use client";
import { useState } from "react";
import { useT } from "@/shared/i18n/client";

/** 계정 화면: 외부 AI 에 넣을 MCP 주소와 연결 방법 */
export function McpConnectCard({ url }: { url: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="card flex flex-col gap-3">
      <h2 className="font-bold">{t("account.mcp_title")}</h2>
      <p className="text-sm text-muted">{t("account.mcp_desc")}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-2 py-1.5 text-sm">{url}</code>
        <button type="button" className="btn-secondary btn-sm" onClick={copy}>
          {copied ? t("account.mcp_copied") : t("account.mcp_copy")}
        </button>
      </div>
      <ul className="list-disc pl-5 text-xs text-muted">
        <li>{t("account.mcp_claude")}</li>
        <li>{t("account.mcp_chatgpt")}</li>
      </ul>
    </div>
  );
}
