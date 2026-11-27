// integration 컨텍스트 공개 API. 다른 컨텍스트와 src/app, scripts 는 이 파일만 import 한다.
// integration 은 테이블·규칙이 없다: MCP 도구 정의(각 컨텍스트 공개 API → JSON)만 둔다. 인증·등록은 ./server.
export type { ToolContext, ToolDef, AnyToolDef, ToolResult, ToolName } from "./application/tools";
export { tools, TOOL_LIST, TOOL_NAMES, SERVER_VERSION, SERVER_INSTRUCTIONS } from "./application/tools";
