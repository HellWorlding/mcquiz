import { expect, type Page } from "@playwright/test";
import { PASSWORD } from "./env";

/** 이메일+비밀번호 폼으로 로그인. 끝나면 홈(또는 next) 으로 간다 */
export async function login(page: Page, email: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(PASSWORD);
  await page.locator("form").filter({ has: page.getByLabel("비밀번호", { exact: true }) }).getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
}

/**
 * 서버 액션(POST) 이 모두 끝날 때까지 기다린다. 풀이 화면은 답을 고르면 기록·진행 저장을 비동기로 보내므로,
 * 다음 동작(헷갈림 체크 등)이 그 결과(attemptId)에 기대면 먼저 이걸 부른다.
 */
export function trackPosts(page: Page) {
  let inflight = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") inflight++;
  });
  const done = (r: { method(): string }) => {
    if (r.method() === "POST") inflight = Math.max(0, inflight - 1);
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return async function settle(quietMs = 400) {
    await expect
      .poll(
        async () => {
          if (inflight > 0) return false;
          await page.waitForTimeout(quietMs);
          return inflight === 0;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  };
}

/** 풀이 화면의 선지 버튼 (본문 글자로 찾는다. 선지는 섞이므로 번호로 고르지 않는다) */
export const choice = (page: Page, text: RegExp) => page.getByRole("button", { name: text });

/** 지금 보이는 문항의 번호 (본문 "E2E 문항 N:" 에서) */
export async function currentQuestionNo(page: Page): Promise<number> {
  const t = await page.getByText(/^E2E 문항 \d+:/).first().textContent();
  const m = /E2E 문항 (\d+):/.exec(t ?? "");
  if (!m) throw new Error(`문항 번호를 못 읽음: ${t}`);
  return Number(m[1]);
}

/** 다음 문항 / 마지막이면 결과 보기 (아래쪽 큰 버튼) */
export async function next(page: Page, last: boolean) {
  await page.getByRole("button", { name: last ? "결과 보기" : "다음", exact: true }).last().click();
}
