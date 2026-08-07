import { describe, expect, it } from "vitest";

import { isInvalidVerifyEmailLink } from "@/lib/auth/verify-email-link";

/**
 * AC-16/AC-18/AC-19 (design doc §4): TOKEN_EXPIRED, INVALID_TOKEN,
 * USER_NOT_FOUND, and "no attemptId at all" must all collapse into the
 * same generic "invalid link" branch — anti-enumeration (AC-18 must not
 * get distinct copy that would leak account-existence information).
 */
describe("isInvalidVerifyEmailLink (§4 — generic invalid-link predicate)", () => {
  it("is invalid when there is no attemptId, regardless of error", () => {
    expect(isInvalidVerifyEmailLink({ attemptId: null, error: null })).toBe(true);
  });

  it("is invalid whenever an error param is present, whatever its value", () => {
    expect(isInvalidVerifyEmailLink({ attemptId: "attempt-1", error: "TOKEN_EXPIRED" })).toBe(true);
    expect(isInvalidVerifyEmailLink({ attemptId: "attempt-1", error: "INVALID_TOKEN" })).toBe(true);
    // USER_NOT_FOUND must fall into the exact same branch as the others —
    // no special-cased copy that would distinguish it (AC-18).
    expect(isInvalidVerifyEmailLink({ attemptId: "attempt-1", error: "USER_NOT_FOUND" })).toBe(true);
    expect(isInvalidVerifyEmailLink({ attemptId: "attempt-1", error: "SOME_UNKNOWN_CODE" })).toBe(
      true,
    );
  });

  it("is valid (success/already-verified path) when attemptId is present and there is no error", () => {
    expect(isInvalidVerifyEmailLink({ attemptId: "attempt-1", error: null })).toBe(false);
  });
});
