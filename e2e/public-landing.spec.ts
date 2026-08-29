import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Browser/HTTP verification of the public landing page (SEO issue #2).
 *
 * `tests/routing/public-landing.test.ts` covers the structural half by
 * reading source files; the half it cannot reach is what the server
 * actually answers with and what a browser actually paints. That is this
 * file: real status codes, real headers, real DOM.
 *
 * Runs with no credentials on purpose — the whole point of `/` is that it
 * needs no session, so unlike the other specs here this one is not
 * `describe.skip`-ed behind a seeded login.
 *
 * NOTE: run this against a production server (`pnpm build && pnpm start`),
 * not `next dev`. AC-SEO2.1 is about prerendered output and dev renders
 * every request on demand.
 */

/** A syntactically plausible but completely bogus session cookie.
 *  `src/middleware.ts` checks cookie *presence* only (AC-SEO7.4), so this
 *  is enough to exercise the signed-in branch without real credentials. */
const FAKE_SESSION_COOKIE = { name: "better-auth.session_token", value: "fake.value" };

async function getWithoutRedirect(request: APIRequestContext, path: string) {
  return request.get(path, { maxRedirects: 0 });
}

test.describe("AC-SEO0.1 / 1.1 — anonymous GET / is a 200 with content", () => {
  test("returns 200 and the landing content, no redirect", async ({ request }) => {
    const res = await getWithoutRedirect(request, "/");

    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("Your portfolio.");
    expect(html).toContain("What you&#x27;ll need");
    expect(html).toContain('href="/sign-in"');
  });

  // AC-SEO1.6: nothing shipped here may block indexing.
  test("no noindex header and no private cache directive", async ({ request }) => {
    const res = await getWithoutRedirect(request, "/");
    const headers = res.headers();

    expect(headers["x-robots-tag"] ?? "").not.toMatch(/noindex|nofollow/i);
    expect(headers["cache-control"] ?? "").not.toMatch(/private/i);

    const html = await res.text();
    expect(html).not.toMatch(/<meta[^>]+name="robots"[^>]+noindex/i);
  });
});

test.describe("AC-SEO1.7 — the page works with JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });

  test("headline, prose and sign-in link are in the initial HTML", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your portfolio.");
    await expect(page.getByText(/Freedom24/).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /create your account/i })).toBeVisible();
  });
});

test.describe("AC-SEO1.4 / §7.1 — required content, as rendered", () => {
  test("hero, three feature blocks, broker list and trust statement", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByText(/Anlage KAP \/ SO/)).toBeVisible();
    await expect(page.getByText("One unified portfolio")).toBeVisible();
    await expect(page.getByText("Anlage KAP + Anlage SO")).toBeVisible();
    // Matched on the card title rather than /staking/: the corrected body
    // (tax review §2) names "§22 Nr. 3 staking income" too, so a loose regex
    // now matches two elements and trips strict mode.
    await expect(page.getByText("§22 staking + §23 FIFO")).toBeVisible();
    await expect(page.getByText(/parsed in your browser and never uploaded/)).toBeVisible();
    // Tax review §3: the disclaimer every other tax surface carries.
    await expect(page.getByText(/not a certified tax filing and not tax advice/)).toBeVisible();
  });

  // The §7.1 amendment: the IBKR line must name the real Client Portal path.
  // The unit test only checks the data module; this asserts the DOM the
  // crawler actually sees.
  test("the IBKR orientation line shows the corrected path, not 'Reports → Activity'", async ({
    page,
  }) => {
    await page.goto("/");

    const ibkrLine = page.locator("li", { hasText: "Interactive Brokers" }).first();
    await expect(ibkrLine).toContainText("Performance & Reports");
    await expect(ibkrLine).toContainText("Statements");
    await expect(ibkrLine).toContainText("Activity Statement");

    const needed = page.locator("main section", { hasText: "What you'll need" }).last();
    await expect(needed).not.toContainText("Reports → Activity");
    await expect(needed).not.toContainText("Annual Activity CSV");
  });

  test("Freedom24 and Coinbase lines agree with the copy module", async ({ page }) => {
    await page.goto("/");

    const freedom = page.locator("li", { hasText: "Freedom24" }).first();
    await expect(freedom).toContainText("Statements");
    await expect(freedom).toContainText("All time");
    await expect(freedom).toContainText("JSON");

    const coinbase = page.locator("li", { hasText: "Coinbase" }).first();
    await expect(coinbase).toContainText("Portfolios");
    await expect(coinbase).toContainText("API keys");
    await expect(coinbase).toContainText("view only");
  });
});

test.describe("AC-SEO1.5 / 5.x — the route into the app", () => {
  test("the sign-in CTA navigates to a working /sign-in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /^sign in$/i }).first().click();

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  });

  test("the sign-in buttons open the auth modal", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
  });

  // AC-SEO4.6: the /sign-in logo is a marketing link back to `/`, not a
  // dashboard pointer, so it must land on the landing page.
  test("the /sign-in logo goes back to the landing page", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("link", { name: /folio/i }).click();

    await expect(page).toHaveURL(new URL("/", page.url()).toString());
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your portfolio.");
  });
});

test.describe("AC-SEO2.3 / 2.5 — the two-hop bounce for cookie holders", () => {
  test("a session cookie redirects / to /dashboard, then /dashboard to /sign-in", async ({
    playwright,
    baseURL,
  }) => {
    const withCookie = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { cookie: `${FAKE_SESSION_COOKIE.name}=${FAKE_SESSION_COOKIE.value}` },
    });

    const first = await withCookie.get("/", { maxRedirects: 0 });
    expect(first.status()).toBe(307);
    expect(first.headers()["location"]).toContain("/dashboard");

    // Second hop: (app)/layout.tsx's requireCurrentUser() rejects the bogus
    // cookie and sends the visitor to /sign-in. Two hops, no loop.
    const second = await withCookie.get("/dashboard", { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(second.status());
    expect(second.headers()["location"]).toContain("/sign-in");

    // And the chain terminates: following it lands on a 200, not a loop.
    const followed = await withCookie.get("/");
    expect(followed.status()).toBe(200);
    expect(new URL(followed.url()).pathname).toBe("/sign-in");

    await withCookie.dispose();
  });

  test("the chain terminates at /sign-in in a real browser", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    await context.addCookies([{ ...FAKE_SESSION_COOKIE, url: baseURL! }]);
    const page = await context.newPage();

    await page.goto("/");

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();

    await context.close();
  });
});

test.describe("AC-SEO3.2 / 0.5 — the auth gate did not move", () => {
  test("anonymous /dashboard redirects to /sign-in", async ({ request }) => {
    const res = await getWithoutRedirect(request, "/dashboard");

    expect([302, 303, 307]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/sign-in");
  });

  test("anonymous /dashboard in a browser lands on the auth screen", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/sign-in$/);
  });
});
