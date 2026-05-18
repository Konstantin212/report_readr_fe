import { expect, test } from "@playwright/test";

test("dashboard presents a calm cockpit instead of a spreadsheet-first view", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: /quiet cockpit/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /import statement/i })).toBeVisible();
  await expect(page.locator("table")).toHaveCount(0);
});

test("imports page exposes the statement upload workflow", async ({ page }) => {
  await page.goto("/imports");

  await expect(page.getByRole("heading", { name: /import broker statements/i })).toBeVisible();
  await expect(page.getByLabel(/statement file/i)).toBeVisible();
  await expect(page.getByLabel(/tax year/i)).toHaveValue("2024");
});
