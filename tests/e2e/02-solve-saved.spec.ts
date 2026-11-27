import { expect, test } from "@playwright/test";
import { USER_EMAIL } from "./env";
import { correctText, promptOf, QUESTION_COUNT, seed, wrongText } from "./seed";
import { choice, currentQuestionNo, login, next, trackPosts } from "./helpers";

test.describe("2. 로그인 → 풀이 → 저장함", () => {
  test("8문항: 2개 틀림·1개 헷갈림·1개 저장 → 점수 → 저장함 칩·회독 → 빼기", async ({ page }) => {
    const s = seed();
    const settle = trackPosts(page);
    await login(page, USER_EMAIL);

    await page.getByRole("link", { name: new RegExp(s.publicSubject.name) }).click();
    await expect(page.getByRole("heading", { name: s.publicSubject.name })).toBeVisible();
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: "시작", exact: true }).click();
    await page.waitForURL(/\/quiz\?/);
    await expect(page.getByText(`1 / ${QUESTION_COUNT}`, { exact: false })).toBeVisible();

    for (let i = 0; i < QUESTION_COUNT; i++) {
      const no = await currentQuestionNo(page);
      const wrong = no === 1 || no === 2;
      await choice(page, new RegExp(`${wrong ? wrongText(no) : correctText(no)}$`)).click();
      await expect(page.getByText(wrong ? "오답" : "정답!", { exact: true })).toBeVisible();
      await settle(); // 기록(attemptId) 이 돌아온 뒤에 헷갈림·저장을 누른다
      if (no === 3) {
        await page.getByRole("button", { name: "헷갈림 체크", exact: true }).click();
        await expect(page.getByRole("button", { name: "✓ 헷갈림", exact: true })).toBeVisible();
        await settle();
      }
      if (no === 4) {
        await page.getByRole("button", { name: "저장", exact: true }).click();
        await expect(page.getByRole("button", { name: "✓ 저장됨", exact: true })).toBeVisible();
        await settle();
      }
      await next(page, i === QUESTION_COUNT - 1);
    }

    await expect(page.getByText("6 / 8점", { exact: true })).toBeVisible();
    await expect(page.getByText("6 / 8문항 · 75%", { exact: true })).toBeVisible();
    await settle();

    await page.goto(`/saved?subject=${s.publicSubject.id}`);
    await expect(page.getByRole("heading", { name: "저장된 문항" })).toBeVisible();
    await expect(page.getByRole("button", { name: "전체 4", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "틀림 2", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "헷갈림 1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "직접 저장 1", exact: true })).toBeVisible();
    await expect(page.getByText("1회독 6/8 75%", { exact: true })).toBeVisible();

    // 틀린 문항 1 을 저장함에서 빼기 → 목록에서 사라짐
    const item = page.locator("li").filter({ hasText: promptOf(1) });
    await expect(item).toHaveCount(1);
    await item.getByRole("button", { name: "빼기", exact: true }).click();
    await expect(page.locator("li").filter({ hasText: promptOf(1) })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "전체 3", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "틀림 1", exact: true })).toBeVisible();
  });
});
