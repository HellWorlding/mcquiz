import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import type { Result } from "@/shared/result";
import { fail, TOOL_LIST, type ToolContext, type ToolResult } from "../application/tools";
import { toolContextFromAuth } from "./make-apis";

/** 도구 호출마다 ToolContext 를 만드는 함수 (기본은 토큰 → 세 컨텍스트 API 조립) */
export type ToolContextFactory = (authInfo: AuthInfo | undefined) => Promise<Result<ToolContext>>;

const TOOL_TIMEOUT_MS = 45_000;

/** 도구 실행 시간을 기록하고, 45초를 넘기거나 예외가 나면 오류 응답으로 바꾼다 (요청이 매달리지 않게) */
async function timed(name: string, fn: () => Promise<ToolResult>): Promise<ToolResult> {
  const t0 = Date.now();
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${name} 이(가) 45초를 넘겨 중단했습니다`)), TOOL_TIMEOUT_MS));
  try {
    const r = await Promise.race([fn(), timeout]);
    console.log(`[mcp] tool ${name} ${Date.now() - t0}ms`);
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[mcp] tool ${name} failed ${Date.now() - t0}ms ${msg}`);
    return fail(`오류: ${msg}`);
  }
}

/**
 * MCP 서버에 도구 11개를 등록한다. 도구 이름은 v1 과 같고 응답 형식만 v2.
 * 모든 조회는 사용자 토큰 클라이언트로 하므로 RLS 가 그대로 적용된다 (볼 수 없는 과목은 애초에 안 나온다).
 */
export function registerTools(server: McpServer, makeContext: ToolContextFactory = toolContextFromAuth): void {
  for (const tool of TOOL_LIST) {
    server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.inputSchema }, async (args, ctx) =>
      timed(tool.name, async () => {
        const c = await makeContext(ctx.http?.authInfo);
        if (!c.ok) return fail(c.error);
        return tool.run(c.data, args);
      }),
    );
  }
}
