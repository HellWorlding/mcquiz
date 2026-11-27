/**
 * 통합 테스트 공통. 로컬 Supabase(`npm run db:start`) 의 기본 키를 쓴다 (비밀이 아니다). 다른 값을 쓰려면 .env.test 에 둔다.
 * .env.local 은 읽지 않는다 — 운영 DB 에 테스트가 붙는 일을 막기 위해서다.
 * 실행: npm run test:int
 */
import { config } from "dotenv";
import { beforeAll } from "vitest";

config({ path: ".env.test" });
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

beforeAll(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error(`통합 테스트는 로컬 Supabase 에서만 돈다 (URL=${url})`);
});
