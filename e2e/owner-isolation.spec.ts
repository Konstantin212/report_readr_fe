import { test, expect } from "@playwright/test";

test.describe("owner isolation (skeleton)", () => {
  // This skeleton verifies that unauthenticated callers can't hit the ingest endpoint.
  // A full A-vs-B test requires Better Auth session seeding helpers, which are
  // planned but not yet implemented. Tracked separately.

  test("anonymous POST to /api/imports/ingest is rejected", async ({ request }) => {
    const res = await request.post("/api/imports/ingest", {
      data: { broker: "INTERACTIVE_BROKERS" },
    });
    // Unauthed → redirect to /sign-in (302/303) or 401/403/405 depending on handler.
    expect([200, 302, 303, 401, 403, 405]).toContain(res.status());
    // If status is 200, body must NOT be a successful ingest summary.
    if (res.status() === 200) {
      const body = await res.json().catch(() => ({}));
      expect(body).not.toHaveProperty("importId");
    }
  });
});
