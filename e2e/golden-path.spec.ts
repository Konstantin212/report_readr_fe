import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// Skipped by default — requires AUTH_DEMO_MODE=true + a running Neon test branch.
// To run locally:
//   AUTH_DEMO_MODE=true AUTH_DEMO_EMAIL=you@example.com pnpm dev
//   then in another terminal:
//   pnpm test:e2e tests/e2e/golden-path.spec.ts

test.describe.skip("golden path: upload → dashboard → tax", () => {
  test("upload IBKR sample, see dashboard numbers, export tax PDF", async ({ page }) => {
    await page.goto("/upload");
    const buffer = readFileSync("tests/fixtures/brokers/ibkr-2025.csv");
    await page.setInputFiles('input[type="file"]', {
      name: "ibkr-2025.csv",
      mimeType: "text/csv",
      buffer,
    });
    await expect(page.getByText(/PARSED|DUPLICATE/)).toBeVisible({ timeout: 30_000 });

    await page.goto("/");
    await expect(page.getByText(/positions/i)).toBeVisible();

    await page.goto("/tax/2025");
    await expect(page.getByText(/Z19/)).toBeVisible();
  });
});
