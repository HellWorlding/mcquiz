import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerTools } from "@/domains/mcp/tools";
import { verifyMcpToken } from "@/domains/mcp/auth";

/**
 * 원격 MCP 엔드포인트 (Streamable HTTP). Claude·ChatGPT 등이 이 주소를 커넥터로 등록한다.
 * 인증은 Supabase Auth 의 OAuth 2.1 서버가 발급한 사용자 토큰으로 하고, 모든 도구는 그 사용자의 RLS 로 동작한다.
 */
const handler = createMcpHandler((server) => registerTools(server), {
  serverInfo: { name: "mcquiz", version: "1.0.0" },
  instructions:
    "mcquiz 는 객관식 퀴즈 앱입니다. 먼저 list_subjects 로 과목 id 를 얻고, list_units / list_questions / get_learning_summary 로 문항과 학습 기록을 읽으세요. 새 문항을 만들 때는 get_authoring_guide 를 읽고 import_questions(mode=check) 로 검사한 뒤 commit 하세요.",
});

const authed = withMcpAuth(handler, verifyMcpToken, { required: true });

export { authed as GET, authed as POST, authed as DELETE };
