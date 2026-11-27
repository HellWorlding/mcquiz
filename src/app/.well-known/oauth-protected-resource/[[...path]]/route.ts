import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { env } from "@/domains/shared/env";

/** RFC 9728 보호 자원 메타데이터: MCP 클라이언트가 어느 인가 서버(Supabase Auth)로 로그인해야 하는지 알려 준다 */
const handler = protectedResourceHandler({ authServerUrls: [`${env.supabaseUrl}/auth/v1`] });
const cors = metadataCorsOptionsRequestHandler();

export { handler as GET, cors as OPTIONS };
