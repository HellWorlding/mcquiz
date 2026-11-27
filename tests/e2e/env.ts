/**
 * e2e 공통 환경. 로컬 Supabase(`npm run db:start`) 의 기본 키만 쓴다 (비밀이 아니다).
 * .env.local(운영) 은 읽지 않는다 — 개발 서버도 playwright.config.ts 가 이 값으로 띄운다.
 */
export const E2E_SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const E2E_ANON_KEY =
  process.env.E2E_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const E2E_SERVICE_KEY =
  process.env.E2E_SERVICE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

export const ADMIN_EMAIL = "e2e-admin@example.com";
export const USER_EMAIL = "e2e-user@example.com";
export const PASSWORD = "e2e-password-123";
export const PREFIX = "__e2e_";

export function assertLocal() {
  if (!isLocalUrl(E2E_SUPABASE_URL)) throw new Error(`e2e 는 로컬 Supabase 에서만 돈다 (URL=${E2E_SUPABASE_URL})`);
}

/** http(s) 이고 hostname 이 정확히 127.0.0.1 / localhost 일 때만 참 */
function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  } catch {
    return false;
  }
}
