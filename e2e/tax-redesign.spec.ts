import { test, expect } from "@playwright/test";

test("tax hub: nav grid → routes + modals", async ({ page }) => {
  await page.goto("/tax/2026");
  await expect(page.getByRole("heading", { name: "Tax" })).toBeVisible();
  await page.getByText(/Realized trades/i).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: /ELSTER values/i }).click();
  await expect(page).toHaveURL(/\/tax\/2026\/elster$/);
  await expect(page.getByRole("heading", { name: /ELSTER values/i })).toBeVisible();
});
