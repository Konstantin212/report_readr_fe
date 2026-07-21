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
