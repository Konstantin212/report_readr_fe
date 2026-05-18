import { expect, test } from "@playwright/test";

test("shows a calm progressive cockpit without a spreadsheet-first dashboard", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: /quiet cockpit/i })).toBeVisible();
  await expect(page.getByText(/both broker portfolios/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /import statement/i })).toBeVisible();
  await expect(page.locator("main table")).toHaveCount(0);
});

test("uploads a broker statement and shows a parsed import summary", async ({ page }) => {
  await page.goto("/imports");

  await page.getByLabel("Statement file").setInputFiles("tests/fixtures/ibkr-activity.sample.csv");
  await page.getByRole("button", { name: "Parse statement" }).click();

  await expect(page.getByText("Interactive Brokers")).toBeVisible();
  await expect(page.getByText("5 normalized events")).toBeVisible();
  await expect(page.getByText("Raw file was parsed in memory and discarded.")).toBeVisible();
});
