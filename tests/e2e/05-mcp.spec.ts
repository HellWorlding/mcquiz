import { expect, test, type APIRequestContext } from "@playwright/test";
import { USER_EMAIL } from "./env";
import { accessToken, EVIDENCE_WORD, seed } from "./seed";

type RpcResponse = { jsonrpc: "2.0"; id: number; result?: Record<string, unknown>; error?: { code: number; message: string } };

/** Streamable HTTP 응답: JSON 이거나 SSE(`data: {...}`) 다. 둘 다 읽는다 */
function parseRpc(body: string): RpcResponse {
  const t = body.trim();
  if (t.startsWith("{")) return JSON.parse(t) as RpcResponse;
  const lines = t.split(/\r?\n/).filter((l) => l.startsWith("data:"));
  if (!lines.length) throw new Error(`MCP 응답을 읽지 못함: ${t.slice(0, 200)}`);
  return JSON.parse(lines[lines.length - 1].slice(5).trim()) as RpcResponse;
}

let rpcId = 0;
async function rpc(request: APIRequestContext, token: string, method: string, params: Record<string, unknown> = {}, session?: string) {
  const res = await request.post("/api/mcp", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...(session ? { "mcp-session-id": session } : {}),
    },
    data: { jsonrpc: "2.0", id: ++rpcId, method, params },
  });
  expect(res.status(), await res.text()).toBe(200);
  return { body: parseRpc(await res.text()), session: res.headers()["mcp-session-id"] };
}

/** tools/call 결과의 첫 text 를 JSON 으로 */
function toolJson(r: RpcResponse): unknown {
  const content = (r.result?.content ?? []) as { type: string; text: string }[];
  expect(r.result?.isError, content[0]?.text).toBeFalsy();
  return JSON.parse(content[0].text);
}

test.describe("5. MCP 2.0", () => {
  test("토큰 없이는 401", async ({ request }) => {
    const res = await request.post("/api/mcp", { headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" }, data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    expect(res.status()).toBe(401);
  });

  test("initialize → tools/list 11개 → list_subjects → search_sources(keyword)", async ({ request }) => {
    const s = seed();
    const token = await accessToken(USER_EMAIL);

    const init = await rpc(request, token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } });
    expect(init.body.error).toBeUndefined();
    expect((init.body.result?.serverInfo as { version?: string })?.version).toBe("2.0.0");
    const session = init.session;

    const list = await rpc(request, token, "tools/list", {}, session);
    const tools = (list.body.result?.tools ?? []) as { name: string }[];
    expect(tools).toHaveLength(11);
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["list_subjects", "search_sources", "get_source", "import_questions"]));

    const subjects = toolJson((await rpc(request, token, "tools/call", { name: "list_subjects", arguments: {} }, session)).body);
    const text = JSON.stringify(subjects);
    expect(text).toContain(s.publicSubject.id);
    expect(text).not.toContain(s.restrictedSubject.id);

    const found = toolJson((await rpc(request, token, "tools/call", { name: "search_sources", arguments: { subject_id: s.publicSubject.id, query: EVIDENCE_WORD } }, session)).body) as {
      mode: string;
      results: { source_id: string }[];
    };
    expect(found.mode).toBe("keyword");
    expect(found.results.length).toBeGreaterThan(0);
    expect(found.results[0].source_id).toBe(s.sourceId);
  });
});
