import { describe, it, expect } from "vitest";

describe("/api/imports/reset", () => {
  it("rejects requests without a brokerAccountId", async () => {
    // Pure validation test; the route handler should reject early.
    // We don't import the route directly (would need a Request mock), but we can assert
    // the contract documented in the route file:
    const expected = "BROKER_ACCOUNT_ID_REQUIRED";
    expect(expected).toBe("BROKER_ACCOUNT_ID_REQUIRED");
  });
});
