import { expect, test } from "@playwright/test";
import { USER_EMAIL } from "./env";
import { seed } from "./seed";
import { login } from "./helpers";

test.describe("6. /weak → /saved", () => {
  test("옛 주소가 쿼리를 유지한 채 /saved 로 간다", async ({ page }) => {
    const s = seed();
    await login(page, USER_EMAIL);
    await page.goto(`/weak?subject=${s.publicSubject.id}&tag=a&tag=b`);
    await expect(page).toHaveURL(new RegExp(`/saved\\?subject=${s.publicSubject.id}&tag=a&tag=b$`));
    await expect(page.getByRole("heading", { name: "저장된 문항" })).toBeVisible();
  });

  test("비로그인은 로그인으로 가되 next 에 원래 쿼리가 남는다", async ({ page }) => {
    const s = seed();
    await page.goto(`/weak?subject=${s.publicSubject.id}`);
    await expect(page).toHaveURL(/\/login\?(.*&)?next=/);
    expect(new URL(page.url()).searchParams.get("next")).toBe(`/weak?subject=${s.publicSubject.id}`);
  });
});
