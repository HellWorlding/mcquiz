// integration 서버 진입점: MCP 인증·도구 등록·API 조립. 라우트 핸들러(src/app/api/mcp)만 import 한다. 클라이언트 컴포넌트("use client")에서는 금지.
export { verifyMcpToken, userFromAuth } from "./infrastructure/mcp-auth";
export { registerTools, type ToolContextFactory } from "./infrastructure/register";
export { toolContext, toolContextFromAuth, APP_HOST } from "./infrastructure/make-apis";
