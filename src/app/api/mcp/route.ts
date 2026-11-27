import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerTools } from "@/domains/mcp/tools";
import { verifyMcpToken } from "@/domains/mcp/auth";

/**
 * 원격 MCP 엔드포인트 (Streamable HTTP). Claude·ChatGPT 등이 이 주소를 커넥터로 등록한다.
 * 인증은 Supabase Auth 의 OAuth 2.1 서버가 발급한 사용자 토큰으로 하고, 모든 도구는 그 사용자의 RLS 로 동작한다.
 */
// 한 요청이 매달려도 플랫폼 상한(300초)까지 가지 않게 60초에서 끊는다
export const maxDuration = 60;
// DB(Supabase, ap-northeast-2 서울)와 같은 지역에서 돌린다 (vercel.json 의 regions 와 맞출 것)
export const preferredRegion = "icn1";

const handler = createMcpHandler((server) => registerTools(server), {
  serverInfo: { name: "mcquiz", version: "1.0.0" },
  // subscriptions/listen 은 오래 열어 두는 스트림이라 서버리스에서 함수가 시간 제한까지 매달린다. 구독은 받지 않는다
  maxSubscriptions: 0,
  // 어떤 메서드·도구가 얼마나 걸렸는지 로그로 남긴다 (Vercel 런타임 로그에서 본다)
  onEvent: (e) => {
    if (e.type === "ERROR") console.error("[mcp] error", e.context ?? "", e.error instanceof Error ? e.error.message : String(e.error));
    else {
      const p = e.parameters as { params?: { name?: string } } | undefined;
      console.log(`[mcp] ${e.type === "REQUEST_RECEIVED" ? `start@${process.env.VERCEL_REGION ?? "local"}` : "done"} ${e.method}${p?.params?.name ? " " + p.params.name : ""}${e.duration !== undefined ? ` ${e.duration}ms` : ""} ${e.status}`);
    }
  },
  instructions:
    "mcquiz 는 객관식 퀴즈 앱입니다. 먼저 list_subjects 로 과목 id 를 얻고, list_units / list_questions / get_learning_summary 로 문항과 학습 기록을 읽으세요. 새 문항을 만들 때는 get_authoring_guide 를 읽고 import_questions(mode=check) 로 검사한 뒤 commit 하세요.",
});

const authed = withMcpAuth(handler, verifyMcpToken, { required: true });

export { authed as GET, authed as POST, authed as DELETE };
