import { defineConfig } from "vitest/config";
import path from "node:path";

/** unit: 순수 도메인·애플리케이션 테스트 (DB 없음). int: 로컬 Supabase 가 필요한 통합 테스트 (npm run test:int) */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["src/**/*.test.ts"] } },
      { extends: true, test: { name: "int", include: ["tests/int/**/*.int.test.ts"], setupFiles: ["tests/int/setup.ts"], testTimeout: 30_000, fileParallelism: false } },
    ],
  },
});
