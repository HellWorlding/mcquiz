import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * 계층 경계 (PRD-ddd-04 §8).
 *  domain → shared 만 · application → 자기 domain, shared, 다른 컨텍스트의 index(공개 API)
 *  infrastructure → 자기 application·domain, shared · ui → 자기 application·domain, shared, 다른 ctx index
 *  app/scripts → ctx 의 index 또는 ui, shared · shared → shared 만
 */
const CTX = "src/contexts/([^/]+)";
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/domains/**"]),
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["src/**/*", "scripts/**/*"],
      "boundaries/elements": [
        { type: "shared", pattern: "src/shared/**/*", mode: "full" },
        { type: "ctx-index", pattern: `${CTX}/index.ts`, mode: "full", capture: ["ctx"] },
        { type: "ctx-server", pattern: `${CTX}/server.ts`, mode: "full", capture: ["ctx"] },
        { type: "ctx-ui", pattern: `${CTX}/ui/index.ts`, mode: "full", capture: ["ctx"] },
        { type: "ui-components", pattern: `${CTX}/ui/components/**/*`, mode: "full", capture: ["ctx"] },
        { type: "domain", pattern: `${CTX}/domain/**/*`, mode: "full", capture: ["ctx"] },
        { type: "application", pattern: `${CTX}/application/**/*`, mode: "full", capture: ["ctx"] },
        { type: "infrastructure", pattern: `${CTX}/infrastructure/**/*`, mode: "full", capture: ["ctx"] },
        { type: "ui", pattern: `${CTX}/ui/**/*`, mode: "full", capture: ["ctx"] },
        { type: "app", pattern: "src/app/**/*", mode: "full" },
        { type: "proxy", pattern: "src/proxy.ts", mode: "full" },
        { type: "scripts", pattern: "scripts/**/*", mode: "full" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "shared", allow: ["shared"] },
            { from: "domain", allow: ["shared", ["domain", { ctx: "${from.ctx}" }]] },
            { from: "application", allow: ["shared", ["domain", { ctx: "${from.ctx}" }], ["application", { ctx: "${from.ctx}" }], "ctx-index"] },
            { from: "infrastructure", allow: ["shared", ["domain", { ctx: "${from.ctx}" }], ["application", { ctx: "${from.ctx}" }], ["infrastructure", { ctx: "${from.ctx}" }], "ctx-index", "ctx-server"] },
            // 클라이언트 컴포넌트: 서버 조립(server.ts)·인프라 금지. 다른 ctx 는 index 와 ui/index 만
            { from: "ui-components", allow: ["shared", ["domain", { ctx: "${from.ctx}" }], ["application", { ctx: "${from.ctx}" }], ["ui", { ctx: "${from.ctx}" }], ["ui-components", { ctx: "${from.ctx}" }], "ctx-index", "ctx-ui"] },
            { from: "ui", allow: ["shared", ["domain", { ctx: "${from.ctx}" }], ["application", { ctx: "${from.ctx}" }], ["infrastructure", { ctx: "${from.ctx}" }], ["ui", { ctx: "${from.ctx}" }], ["ui-components", { ctx: "${from.ctx}" }], "ctx-index", "ctx-server", "ctx-ui"] },
            { from: "ctx-index", allow: ["shared", ["domain", { ctx: "${from.ctx}" }], ["application", { ctx: "${from.ctx}" }]] },
            { from: "ctx-server", allow: ["shared", ["domain", { ctx: "${from.ctx}" }], ["application", { ctx: "${from.ctx}" }], ["infrastructure", { ctx: "${from.ctx}" }]] },
            { from: "ctx-ui", allow: ["shared", ["ui", { ctx: "${from.ctx}" }], ["ui-components", { ctx: "${from.ctx}" }]] },
            { from: ["app", "proxy"], allow: ["shared", "ctx-index", "ctx-server", "ctx-ui", "ui", "ui-components", "app"] },
            { from: "scripts", allow: ["shared", "ctx-index", "ctx-server", "scripts"] },
          ],
        },
      ],
      // 컨텍스트 폴더 밖에서 다른 컨텍스트 내부 파일을 직접 import 하는 것은 element-types 가 막는다
    },
  },
]);

export default eslintConfig;
