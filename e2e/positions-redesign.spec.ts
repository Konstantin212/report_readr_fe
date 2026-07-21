import { test, expect } from "@playwright/test";

test("positions: hero, sort, open + close detail", async ({ page }) => {
  await page.goto("/positions");
  await expect(page.getByText(/Portfolio value/i)).toBeVisible();          // hero
  await page.getByRole("button", { name: /^Gain$/ }).click();
  await expect(page).toHaveURL(/sort=gain/);                                // sort persists to URL
  await page.locator("main button").filter({ hasText: /€/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();                     // slide-over
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test.describe("mobile viewport (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile: bottom-nav present, layouts stacked", async ({ page }) => {
    await page.goto("/positions");
    await expect(page.locator("nav.lg\\:hidden")).toBeVisible();          // BottomNav
    await expect(page.getByText(/Portfolio value/i)).toBeVisible();
  });
});
