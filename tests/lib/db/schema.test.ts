import { describe, it, expect } from "vitest";
import * as schema from "@/lib/db/schema";

describe("schema exports", () => {
  it("exposes the expected tables", () => {
    const expected = [
      "user", "session", "account", "verification",
      "brokerAccounts", "imports", "instruments", "transactions",
      "positions", "fxRates", "lots", "realizedMatches",
      "quoteCache", "userSettings", "taxReports", "taxReportLines",
      "signupAttempts",
    ];
    for (const name of expected) expect((schema as Record<string, unknown>)[name]).toBeDefined();
  });

  it("fx_rates has no owner column", () => {
    const cols = Object.keys(schema.fxRates as object);
    expect(cols).not.toContain("ownerUserId");
  });

  // Email-verification-gate design doc §2.4: signupAttempts is the
  // cross-device session-grant correlation table — must carry attemptId
  // (opaque, unique), userId (cascade FK), expiresAt, and consumedAt
  // (nullable — null means not yet claimed).
  it("signupAttempts has the cross-device session-grant correlation columns", () => {
    const cols = Object.keys(schema.signupAttempts as object);
    expect(cols).toEqual(
      expect.arrayContaining(["id", "attemptId", "userId", "expiresAt", "consumedAt", "createdAt"]),
    );
  });

  // user.signupAttemptId is a transient passthrough column (never
  // durable, never returned in API responses — see setup.ts's
  // `additionalFields.signupAttemptId: { returned: false }`).
  it("user has the transient signupAttemptId passthrough column", () => {
    const cols = Object.keys(schema.user as object);
    expect(cols).toContain("signupAttemptId");
  });
});
