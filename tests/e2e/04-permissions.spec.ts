import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, USER_EMAIL } from "./env";
import { seed } from "./seed";
import { login } from "./helpers";

test.describe("4. 권한", () => {
  test("일반 사용자: /admin 은 홈으로 튕기고, 제한 과목은 보이지 않음", async ({ page }) => {
    const s = seed();
    await login(page, USER_EMAIL);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/\?error=forbidden$/);
    await expect(page.getByText("접근 권한이 없습니다.", { exact: true })).toBeVisible();
    await expect(page.getByText(s.restrictedSubject.name)).toHaveCount(0);

    // loading.tsx 로 스트리밍이 먼저 시작돼 HTTP 상태는 200 일 수 있다 → 화면의 404 로 본다
    await page.goto(`/subjects/${s.restrictedSubject.id}`);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(page.getByText(s.restrictedSubject.name)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "시작", exact: true })).toHaveCount(0);
  });

  test("관리자: /admin/upload 접근 가능, 제한 과목도 보임", async ({ page }) => {
    const s = seed();
    await login(page, ADMIN_EMAIL);
    await expect(page.getByRole("link", { name: new RegExp(s.restrictedSubject.name) })).toBeVisible();

    const res = await page.goto("/admin/upload");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/admin\/upload$/);
    await expect(page.getByRole("link", { name: "문제 업로드", exact: true })).toBeVisible();
    await expect(page.getByText("접근 권한이 없습니다.")).toHaveCount(0);
  });
});
