import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { USER_EMAIL } from "./env";
import { correctText, EVIDENCE_WORD, seed } from "./seed";
import { choice, currentQuestionNo, login, trackPosts } from "./helpers";

test.describe("3. 근거 찾기·메모·내보내기", () => {
  test("근거 찾기(키워드) → 메모가 /notes 에 → 저장함 JSON 내보내기 v2", async ({ page }) => {
    const s = seed();
    const settle = trackPosts(page);
    await login(page, USER_EMAIL);

    await page.goto(`/quiz?subject=${s.publicSubject.id}&count=all&order=seq`);
    const no = await currentQuestionNo(page);
    await choice(page, new RegExp(`${correctText(no)}$`)).click();
    await expect(page.getByText("정답!", { exact: true })).toBeVisible();
    await settle();

    // 근거 찾기: 임베딩이 없는 과목이라 키워드 검색으로 자료 조각이 나온다
    await page.getByRole("button", { name: "근거 찾기", exact: true }).click();
    await expect(page.getByText(/^근거 [1-9]\d*건/)).toBeVisible();
    await expect(page.getByText(new RegExp(`${EVIDENCE_WORD}.*조각`)).first()).toBeVisible();

    // 메모 (자동 저장)
    const memo = `e2e 메모 ${Date.now()}`;
    await page.getByRole("button", { name: "메모", exact: true }).click();
    await page.getByPlaceholder("이 문항에 대한 메모 (자동 저장)").fill(memo);
    // 입력을 멈추고 0.8초 뒤 자동 저장 → "입력 중" 이 사라지고 실패 표시가 없어야 한다
    await expect(page.getByText("입력 중", { exact: true })).toHaveCount(0, { timeout: 5_000 });
    await settle();
    await expect(page.getByText("저장 실패", { exact: true })).toHaveCount(0);
    // 저장함에 넣어 두기 (내보내기 대상)
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("button", { name: "✓ 저장됨", exact: true })).toBeVisible();
    await settle();

    await page.goto(`/notes?subject=${s.publicSubject.id}`);
    await expect(page.getByText(memo)).toBeVisible();

    await page.goto(`/saved?subject=${s.publicSubject.id}`);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    const file = await downloading;
    expect(file.suggestedFilename()).toMatch(/\.json$/);
    const data = JSON.parse(await readFile((await file.path())!, "utf8")) as { format?: string; version?: number; questions?: unknown[] };
    expect(data.format).toBe("mcquiz-saved-export");
    expect(data.version).toBe(2);
    expect(Array.isArray(data.questions) && data.questions.length).toBeTruthy();
  });
});
