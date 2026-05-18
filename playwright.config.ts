import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "bash -lc 'source ~/.nvm/nvm.sh && pnpm dev'",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      AUTH_DEMO_MODE: "true",
      AUTH_DEMO_EMAIL: "e2e@example.com",
      AUTHORIZED_EMAILS: "e2e@example.com",
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
      BETTER_AUTH_SECRET: "e2e-local-only-secret",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
