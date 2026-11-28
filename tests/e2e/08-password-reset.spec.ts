import { expect, test } from "@playwright/test";
import { USER_EMAIL } from "./env";

test.describe("8. 비밀번호 재설정·아이디 안내", () => {
  test("로그인 화면에서 재설정 링크 요청 → 보냈다는 안내, 아이디 안내 문구가 보임", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("아이디는 가입할 때 쓴 이메일입니다", { exact: false })).toBeVisible();
    await expect(page.getByText("비밀번호 없이 이메일로 로그인")).toBeVisible();
    await page.getByRole("button", { name: "비밀번호를 잊으셨나요?" }).click();
    const form = page.locator("form").filter({ hasText: "비밀번호 재설정" });
    await form.getByPlaceholder("이메일").fill(USER_EMAIL);
    await form.getByRole("button", { name: "재설정 링크 받기" }).click();
    await expect(form.getByText("재설정 링크를 메일로 보냈습니다", { exact: false })).toBeVisible({ timeout: 15_000 });
  });
});
