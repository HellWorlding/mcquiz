"use client";
import { useState, useTransition } from "react";
import { decideOAuthAction } from "../actions";

export function ConsentForm({ authorizationId, clientName, clientUri, scopes, email }: { authorizationId: string; clientName: string; clientUri: string | null; scopes: string[]; email: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideOAuthAction(authorizationId, approve);
      if (r.ok) window.location.href = r.data;
      else setError(r.error);
    });
  return (
    <div className="card flex flex-col gap-4">
      <h1 className="text-xl font-bold">앱 연결 허용</h1>
      <p className="text-base">
        <span className="font-semibold">{clientName}</span>
        {clientUri && <span className="ml-1 text-xs text-muted">({clientUri})</span>} 이(가) <span className="font-semibold">{email}</span> 계정으로 mcquiz 를 쓰려고 합니다.
      </p>
      <ul className="list-disc pl-5 text-sm text-muted">
        <li>내가 볼 수 있는 과목·단원·문항과 내 풀이 기록을 읽습니다.</li>
        <li>관리자 계정이면 문항을 넣을 수도 있습니다.</li>
        {scopes.length > 0 && <li>요청 범위: {scopes.join(", ")}</li>}
      </ul>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" disabled={pending} onClick={() => decide(true)}>
          {pending ? "처리 중…" : "허용"}
        </button>
        <button type="button" className="btn-secondary flex-1" disabled={pending} onClick={() => decide(false)}>
          거부
        </button>
      </div>
      <p className="text-xs text-muted">허용을 취소하려면 나중에 계정 화면에서 연결을 끊으면 됩니다.</p>
    </div>
  );
}
