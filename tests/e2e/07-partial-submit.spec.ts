import { expect, test } from "@playwright/test";
import { USER_EMAIL } from "./env";
import { correctText, QUESTION_COUNT, seed } from "./seed";
import { choice, login, trackPosts } from "./helpers";

test.describe("7. 덜 풀고 제출 → 이어서 풀기", () => {
  test("원래 번호(단원.문항) · 단축키 q/w/x · 빼기가 저장을 덮음 · 미응답이 남으면 이어서 풀기 목록에 남고 첫 미응답부터 연다 · 헷갈림 유지", async ({ page }) => {
    const s = seed();
    const settle = trackPosts(page);
    await login(page, USER_EMAIL);

    await page.goto(`/quiz?subject=${s.publicSubject.id}&count=all&order=seq`);
    // 헤더: "1 / 8 · 1.1" (단원 번호 1, 문항 번호 1)
    await expect(page.getByText(`1 / ${QUESTION_COUNT} · 1.1`, { exact: false })).toBeVisible();
    await choice(page, new RegExp(`${correctText(1)}$`)).click();
    await expect(page.getByText("정답!", { exact: true })).toBeVisible();
    await settle();

    // 5번 문항 (다른 시나리오가 저장하지 않은 문항) 에 답하고 단축키 확인
    await page.locator("aside").getByRole("button", { name: "5", exact: true }).click();
    await expect(page.getByText(`5 / ${QUESTION_COUNT} · 1.5`, { exact: false })).toBeVisible();
    await choice(page, new RegExp(`${correctText(5)}$`)).click();
    await expect(page.getByText("정답!", { exact: true })).toBeVisible();
    await settle();
    await expect(page.getByRole("button", { name: "저장", exact: true })).toBeVisible();
    // 단축키 w 저장 → x 빼기: 빼기가 저장 표시를 덮는다 → x 되돌리기: 저장 표시가 돌아온다 → w 저장 취소
    await page.keyboard.press("w");
    await expect(page.getByRole("button", { name: "✓ 저장됨", exact: true })).toBeVisible();
    await settle();
    await page.keyboard.press("x");
    await expect(page.getByRole("button", { name: "✓ 뺌 · 되돌리기", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "저장", exact: true })).toBeVisible();
    await settle();
    await page.keyboard.press("x");
    await expect(page.getByRole("button", { name: "✓ 저장됨", exact: true })).toBeVisible();
    await settle();
    await page.keyboard.press("w");
    await expect(page.getByRole("button", { name: "저장", exact: true })).toBeVisible();
    await settle();

    // 6번 문항 (다른 시나리오가 헷갈림을 켜지 않은 문항): 단축키 q 로 헷갈림 켜기 (답은 고르지 않는다)
    const grid = page.locator("aside");
    await grid.getByRole("button", { name: "6", exact: true }).click();
    await expect(page.getByText(`6 / ${QUESTION_COUNT} · 1.6`, { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "헷갈림 체크", exact: true })).toBeVisible();
    await page.keyboard.press("q");
    await expect(page.getByRole("button", { name: "✓ 헷갈림", exact: true })).toBeVisible();
    await settle();

    // 마지막 문항으로 가서 답하지 않고 결과 보기
    await grid.getByRole("button", { name: String(QUESTION_COUNT), exact: true }).click();
    await page.getByRole("button", { name: "결과 보기", exact: true }).last().click();
    const resume = page.getByRole("button", { name: `안 푼 ${QUESTION_COUNT - 2}문항 이어서 풀기`, exact: true });
    await expect(resume).toBeVisible();
    await settle();
    await expect(page).toHaveURL(/\/quiz\?session=/);
    const sessionId = new URL(page.url()).searchParams.get("session");
    expect(sessionId).toBeTruthy();
    // 결과 화면 버튼 → 같은 퀴즈를 첫 미응답(2번)부터
    await resume.click();
    await expect(page.getByText(`2 / ${QUESTION_COUNT} · 1.2`, { exact: false })).toBeVisible();
    await settle();

    // 시작 화면 "이어서 풀기" 목록에 남는다 (위치 = 첫 미응답 2번)
    await page.goto(`/subjects/${s.publicSubject.id}`);
    const link = page.locator(`a[href="/quiz?session=${sessionId}"]`);
    await expect(link).toBeVisible();
    await expect(link).toContainText(`2/${QUESTION_COUNT}`);

    // 목록에서 열면 첫 미응답 문항(2번)부터
    await link.click();
    await page.waitForURL(/\/quiz\?session=/);
    await expect(page.getByText(`2 / ${QUESTION_COUNT} · 1.2`, { exact: false })).toBeVisible();

    // 새 퀴즈를 열어도 6번은 헷갈림을 켠 채로 시작한다 (다시 끄기 전까지 유지)
    await page.goto(`/quiz?subject=${s.publicSubject.id}&count=all&order=seq`);
    await page.locator("aside").getByRole("button", { name: "6", exact: true }).click();
    await expect(page.getByText(`6 / ${QUESTION_COUNT} · 1.6`, { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "✓ 헷갈림", exact: true })).toBeVisible();
  });
});
