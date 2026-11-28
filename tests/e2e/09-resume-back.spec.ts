import { expect, test, type Page } from "@playwright/test";
import { USER_EMAIL } from "./env";
import { correctText, QUESTION_COUNT, seed } from "./seed";
import { choice, login, trackPosts } from "./helpers";

/** 지금 화면이 n번 문항이고, 옆 칸의 답한 수가 answered 인지 */
async function expectAt(page: Page, n: number, total: number, answered: number) {
  await expect(page.getByText(`${n} / ${total} · 1.${n}`, { exact: false })).toBeVisible();
  await expect(page.locator("aside").getByText(`${answered}/${total}`, { exact: true })).toBeVisible();
}

test.describe("9. 뒤로가기·새로고침에서 풀이 이어가기 (D-021)", () => {
  test("로그인: 원문 보기는 새 탭 · 다른 페이지 갔다 뒤로가기 · 새로고침 뒤에도 3번 문항·답 2개", async ({ page, context }) => {
    const s = seed();
    const settle = trackPosts(page);
    // 스냅샷은 hydration 뒤에만 읽는다 → 서버·클라이언트 첫 그림이 어긋나면 안 된다
    const hydrationErrors: string[] = [];
    page.on("console", (m) => {
      if (/hydrat/i.test(m.text())) hydrationErrors.push(m.text());
    });
    await login(page, USER_EMAIL);

    await page.goto(`/quiz?subject=${s.publicSubject.id}&count=all&order=seq`);
    await choice(page, new RegExp(`${correctText(1)}$`)).click();
    await expect(page.getByText("정답!", { exact: true })).toBeVisible();
    await settle();
    await page.locator("aside").getByRole("button", { name: "3", exact: true }).click();
    await choice(page, new RegExp(`${correctText(3)}$`)).click();
    await expect(page.getByText("정답!", { exact: true })).toBeVisible();
    await settle();
    await expectAt(page, 3, QUESTION_COUNT, 2);
    // 첫 저장 뒤 주소가 세션으로 바뀐다 → 뒤로가기·새로고침·다른 기기에서 서버 기록으로 이어진다
    await expect(page).toHaveURL(/\/quiz\?session=/);
    const quizUrl = page.url();
    // 선지 순서 (복원 뒤에도 같아야 번호가 맞는다)
    const choiceOrder = () => page.getByRole("button", { name: /선지 3/ }).allTextContents();
    const order = await choiceOrder();
    expect(order).toHaveLength(4);

    // 근거 패널의 원문 링크는 새 탭으로 열린다. 원래 탭은 그대로 3번
    await page.getByRole("button", { name: "근거 찾기", exact: true }).click();
    const link = page.getByTitle("원문 보기 ↗").first();
    await expect(link).toHaveAttribute("target", "_blank");
    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await popup.waitForLoadState();
    expect(popup.url()).toMatch(/\/sources\//);
    await popup.close();
    await expect(page).toHaveURL(quizUrl);
    await expectAt(page, 3, QUESTION_COUNT, 2);

    // 같은 탭에서 다른 페이지에 갔다가 뒤로가기
    await page.goto(`/notes?subject=${s.publicSubject.id}`);
    await page.goBack();
    await expect(page).toHaveURL(quizUrl);
    await expectAt(page, 3, QUESTION_COUNT, 2);
    await expect(page.getByText("정답!", { exact: true })).toBeVisible();

    // 앱 안 이동(나가기 링크 → 과목 화면) 뒤 뒤로가기
    await page.getByRole("link", { name: "← 나가기", exact: true }).click();
    await page.waitForURL(/\/subjects\//);
    await page.goBack();
    await expect(page).toHaveURL(quizUrl);
    await expectAt(page, 3, QUESTION_COUNT, 2);

    // 새로고침
    await page.reload();
    await expectAt(page, 3, QUESTION_COUNT, 2);
    await expect(page.getByText("정답!", { exact: true })).toBeVisible();
    expect(await choiceOrder()).toEqual(order);

    // 답을 고르지 않고 옮긴 위치(‹ 로 2번)도 남는다 — 서버 세션은 답할 때·다음으로 넘길 때만 위치를 저장한다
    await page.getByRole("button", { name: "이전", exact: true }).first().click();
    await expectAt(page, 2, QUESTION_COUNT, 2);
    await page.reload();
    await expectAt(page, 2, QUESTION_COUNT, 2);
    expect(hydrationErrors).toEqual([]);
  });

  test("게스트: 2번까지 풀고 다른 페이지 갔다 뒤로가기 → 2번·답 2개", async ({ page }) => {
    const s = seed();
    await page.goto(`/quiz?subject=${s.publicSubject.id}&count=all&order=seq`);
    await choice(page, new RegExp(`${correctText(1)}$`)).click();
    await expect(page.getByText("정답!", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "다음", exact: true }).last().click();
    await choice(page, new RegExp(`${correctText(2)}$`)).click();
    await expect(page.getByText("정답!", { exact: true })).toBeVisible();
    await expectAt(page, 2, 5, 2);

    await page.goto("/");
    await page.goBack();
    await expectAt(page, 2, 5, 2);
    await expect(page.getByText("정답!", { exact: true })).toBeVisible();

    // 앱 안 이동(나가기 링크 → 과목 화면) 뒤 뒤로가기: 화면이 새로 조립돼도 탭 스냅샷으로 이어진다
    await page.getByRole("link", { name: "← 나가기", exact: true }).click();
    await page.waitForURL(/\/subjects\//);
    await page.goBack();
    await expectAt(page, 2, 5, 2);
    await expect(page.getByText("정답!", { exact: true })).toBeVisible();
  });
});
