import { defineConfig, devices } from "@playwright/test";
import { ADMIN_EMAIL, E2E_ANON_KEY, E2E_BASE_URL, E2E_PORT, E2E_SERVICE_KEY, E2E_SUPABASE_URL } from "./tests/e2e/env";

/**
 * e2e (Playwright). 로컬 Supabase 가 떠 있어야 한다 (`npm run db:start`).
 * 개발 서버는 로컬 키를 환경변수로 넘겨 3100 포트에 띄운다 — .env.local(운영) 값이 쓰이지 않게 모두 덮어쓴다.
 * 실행: npm run test:e2e
 */
export default defineConfig({
  testDir: "tests/e2e",
  // 같은 사용자·과목을 공유하므로 순서대로 한 워커에서 돈다
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: E2E_BASE_URL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -H 127.0.0.1 -p ${E2E_PORT}`,
    url: E2E_BASE_URL,
    // 이미 떠 있는 서버(운영 .env.local 로 띄웠을 수 있음)는 재사용하지 않는다. 같은 e2e 환경으로 띄운 서버를 일부러 재사용할 때만 E2E_REUSE_SERVER=1
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: E2E_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: E2E_SERVICE_KEY,
      ADMIN_EMAIL,
      PUBLIC_GUEST_ACCESS: "true",
      OPENAI_API_KEY: "",
      NEXT_PUBLIC_CANONICAL_HOST: "127.0.0.1",
    },
  },
});
