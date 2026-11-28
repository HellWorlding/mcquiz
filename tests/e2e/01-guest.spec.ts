import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { correctText, seed } from "./seed";
import { choice, currentQuestionNo } from "./helpers";

const hasTrialCookie = async (context: BrowserContext) => (await context.cookies()).some((c) => c.name === "mcquiz_guest_trial");

/** 홈 → 공개 과목 → 단원 고르고 전체 시작 */
async function startFromHome(page: Page) {
  const s = seed();
  await page.goto("/");
  await page.getByRole("link", { name: new RegExp(s.publicSubject.name) }).click();
  await expect(page.getByRole("heading", { name: s.publicSubject.name })).toBeVisible();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await page.waitForURL(/\/quiz\?/);
}

test.describe("1. 게스트 체험", () => {
  test("공개 과목만 보이고, 5문항만 나오며, 첫 답에 쿠키가 생기고, 다시 열면 잠김", async ({ page, context }) => {
    const s = seed();
    await page.goto("/");
    await expect(page.getByRole("link", { name: new RegExp(s.publicSubject.name) })).toBeVisible();
    await expect(page.getByText(s.restrictedSubject.name)).toHaveCount(0);

    await startFromHome(page);
    const url = new URL(page.url());
    expect(url.searchParams.get("subject")).toBe(s.publicSubject.id);
    expect(url.searchParams.get("count")).toBe("all");
    // 8문항 과목이지만 게스트는 5문항만
    // 헤더: "1 / 5 · 1.N" (원래 문항 번호 = 단원번호.문항번호)
    await expect(page.getByText(/^1 \/ 5 · 1\.\d+$/)).toBeVisible();

    expect(await hasTrialCookie(context)).toBe(false);
    const no = await currentQuestionNo(page);
    await choice(page, new RegExp(`${correctText(no)}$`)).click();
    await expect.poll(() => hasTrialCookie(context)).toBe(true);

    // 같은 날 새 퀴즈를 다시 열면 잠김 카드 (문항 0)
    await page.goto(`/quiz?subject=${s.publicSubject.id}&count=all`);
    await expect(page.getByText("오늘의 체험 5문항을 이미 푸셨습니다", { exact: false })).toBeVisible();
    await expect(page.getByText(/^E2E 문항 \d+:/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "로그인하고 계속 풀기" })).toHaveAttribute("href", /^\/login\?next=/);
  });

  // 앱 버그(보고함): 첫 답에서 markGuestTrialAction 이 쿠키를 쓰면 서버 액션이 현재 경로를 다시 그리고,
  // loadQuiz 가 "오늘 체험 사용" 으로 보아 문항 0 → 잠김 카드로 바뀐다. 2번째 문항부터 풀 수 없다.
  // 고쳐지면 이 test.fail 을 지운다 (그때는 "expected to fail" 이 깨져 알려 준다).
  test("5문항을 끝까지 풀면 체험 완료 카드와 로그인 링크", async ({ page }) => {
    test.setTimeout(40_000);
    await startFromHome(page);
    for (let i = 0; i < 5; i++) {
      const no = await currentQuestionNo(page);
      await choice(page, new RegExp(`${correctText(no)}$`)).click();
      await expect(page.getByText("정답!", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: i === 4 ? "결과 보기" : "다음", exact: true }).last().click({ timeout: 5_000 });
    }
    await expect(page.getByText("체험 5문항을 모두 풀었습니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "로그인하고 계속 풀기" })).toHaveAttribute("href", /^\/login\?next=/);
  });
});
