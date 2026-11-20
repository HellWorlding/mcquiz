"use client";
import { useEffect } from "react";

/**
 * 라우트 오류 화면. 가장 흔한 원인은 새 버전이 배포된 뒤 열어 둔 옛 화면이 서버를 부른 경우라,
 * 새로고침하면 대개 해결된다. 풀이 진행은 세션에 저장되므로 같은 주소로 돌아오면 이어서 풀 수 있다.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="mx-auto flex max-w-md flex-col gap-3 p-6 text-center">
      <h1 className="text-xl font-bold">화면을 불러오지 못했습니다</h1>
      <p className="text-sm text-muted">
        새 버전이 배포된 직후에 생길 수 있습니다. 새로고침하면 대부분 해결되고, 풀던 퀴즈는 저장되어 있어 같은 화면에서 이어집니다.
      </p>
      <div className="flex justify-center gap-2">
        <button className="btn-primary" onClick={() => window.location.reload()}>
          새로고침
        </button>
        <button className="btn-secondary" onClick={() => reset()}>
          다시 시도
        </button>
      </div>
      {error.digest && <p className="text-xs text-muted">오류 코드: {error.digest}</p>}
    </section>
  );
}
