import { describe, expect, it } from "vitest";

import {
  isPasswordLongEnough,
  mapAuthErrorMessage,
  FOLIO_AUTH_CHANNEL_NAME,
  isEmailVerifiedBroadcastMessage,
  buildVerifyEmailCallbackURL,
  SIGNUP_ATTEMPT_POLL_INTERVAL_MS,
  SIGNUP_ATTEMPT_POLL_TIMEOUT_MS,
  hasSignupAttemptPollTimedOut,
  isEmailNotVerifiedSignInError,
  waitStateMessage,
  parseClaimResponseStatus,
} from "@/components/auth/auth-card";

describe("isPasswordLongEnough (client-side pre-check, AC-3)", () => {
  it("rejects empty and short passwords", () => {
    expect(isPasswordLongEnough("")).toBe(false);
    expect(isPasswordLongEnough("short1")).toBe(false);
    expect(isPasswordLongEnough("1234567")).toBe(false);
  });

  it("accepts exactly 8 characters and longer", () => {
    expect(isPasswordLongEnough("12345678")).toBe(true);
    expect(isPasswordLongEnough("a-much-longer-password")).toBe(true);
  });
});

describe("mapAuthErrorMessage (§6.2/§4 error-code mapping)", () => {
  it("maps INVALID_EMAIL to a descriptive message", () => {
    expect(mapAuthErrorMessage("INVALID_EMAIL")).toMatch(/valid email/i);
  });

  it("maps PASSWORD_TOO_SHORT to the 8-char policy message", () => {
    expect(mapAuthErrorMessage("PASSWORD_TOO_SHORT")).toMatch(/8 characters/i);
  });

  it("maps USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL to an account-exists message", () => {
    expect(mapAuthErrorMessage("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")).toMatch(
      /already exists/i,
    );
  });

  it("maps INVALID_EMAIL_OR_PASSWORD to a generic, non-enumerating message (AC-6)", () => {
    const message = mapAuthErrorMessage("INVALID_EMAIL_OR_PASSWORD");
    expect(message).toMatch(/check.*email.*password/i);
    // Must not reveal whether the email specifically exists.
    expect(message.toLowerCase()).not.toContain("no account");
    expect(message.toLowerCase()).not.toContain("doesn't exist");
  });

  it("falls back to a generic message for an unrecognized/undefined code", () => {
    expect(mapAuthErrorMessage(undefined)).toBeTruthy();
    expect(mapAuthErrorMessage("SOME_FUTURE_CODE")).toBeTruthy();
  });

  it("prefers the server-supplied fallback message for unrecognized codes when given", () => {
    expect(mapAuthErrorMessage("SOME_FUTURE_CODE", "server said this")).toBe("server said this");
  });
});

/**
 * Step 7 (design doc §3/§9): same-browser live-sync message contract.
 * `correlationId` scopes the message to exactly one waiting tab (AC-11) —
 * a bare "something changed" event is not sufficient.
 */
describe("isEmailVerifiedBroadcastMessage (design doc §3, folio-auth channel contract)", () => {
  it("uses the dedicated app-owned channel name, not better-auth's internal shim", () => {
    // design doc §1: better-auth's own localStorage-based shim only fires
    // for /sign-out, /update-user, /update-session — never /verify-email —
    // so this feature deliberately owns its own channel.
    expect(FOLIO_AUTH_CHANNEL_NAME).toBe("folio-auth");
  });

  it("accepts a well-formed email-verified message", () => {
    expect(isEmailVerifiedBroadcastMessage({ type: "email-verified", correlationId: "abc-123" })).toBe(
      true,
    );
  });

  it("rejects null, non-objects, and messages of the wrong type", () => {
    expect(isEmailVerifiedBroadcastMessage(null)).toBe(false);
    expect(isEmailVerifiedBroadcastMessage(undefined)).toBe(false);
    expect(isEmailVerifiedBroadcastMessage("email-verified")).toBe(false);
    expect(isEmailVerifiedBroadcastMessage({ type: "session" })).toBe(false);
  });

  it("rejects a message with a missing or non-string correlationId", () => {
    expect(isEmailVerifiedBroadcastMessage({ type: "email-verified" })).toBe(false);
    expect(isEmailVerifiedBroadcastMessage({ type: "email-verified", correlationId: 123 })).toBe(
      false,
    );
  });
});

describe("buildVerifyEmailCallbackURL (§2.2/§3 — shared callbackURL construction)", () => {
  it("builds a /verify-email path carrying the correlation id as attemptId", () => {
    expect(buildVerifyEmailCallbackURL("attempt-1")).toBe("/verify-email?attemptId=attempt-1");
  });

  it("URL-encodes the correlation id", () => {
    expect(buildVerifyEmailCallbackURL("has space/slash")).toBe(
      "/verify-email?attemptId=has%20space%2Fslash",
    );
  });
});

describe("hasSignupAttemptPollTimedOut (§2.3 — 10-minute poll bound)", () => {
  it("has not timed out immediately, or partway through the window", () => {
    expect(hasSignupAttemptPollTimedOut(0, 0)).toBe(false);
    expect(hasSignupAttemptPollTimedOut(0, SIGNUP_ATTEMPT_POLL_TIMEOUT_MS - 1)).toBe(false);
  });

  it("has timed out at and beyond the 10-minute bound", () => {
    expect(hasSignupAttemptPollTimedOut(0, SIGNUP_ATTEMPT_POLL_TIMEOUT_MS)).toBe(true);
    expect(hasSignupAttemptPollTimedOut(0, SIGNUP_ATTEMPT_POLL_TIMEOUT_MS + 1000)).toBe(true);
  });

  it("poll interval is 3 seconds, matching design doc §2.3", () => {
    expect(SIGNUP_ATTEMPT_POLL_INTERVAL_MS).toBe(3000);
  });
});

describe("isEmailNotVerifiedSignInError (§5/AC-7 — replaces the removed unverifiedNudge branch)", () => {
  it("recognizes better-auth's EMAIL_NOT_VERIFIED code (sign-in.mjs:229-241)", () => {
    expect(isEmailNotVerifiedSignInError("EMAIL_NOT_VERIFIED")).toBe(true);
  });

  it("does not match unrelated or undefined codes", () => {
    expect(isEmailNotVerifiedSignInError("INVALID_EMAIL_OR_PASSWORD")).toBe(false);
    expect(isEmailNotVerifiedSignInError(undefined)).toBe(false);
  });
});

describe("waitStateMessage (§5 — anti-enumeration copy, one shared component, two variants)", () => {
  it("signup variant mirrors the forgot-password anti-enumeration phrasing pattern (AC-4)", () => {
    const message = waitStateMessage("signup");
    expect(message).toMatch(/if an account can be created/i);
    // Must not confirm/deny whether the email was already registered.
    expect(message.toLowerCase()).not.toContain("already exists");
    expect(message.toLowerCase()).not.toContain("already have");
  });

  it("blocked-sign-in variant explains the block without claiming access is available (AC-7/AC-15 copy honesty)", () => {
    const message = waitStateMessage("blocked-sign-in");
    expect(message).toMatch(/hasn't been verified/i);
  });
});

describe("parseClaimResponseStatus (§2.2 — fail-safe parsing of /signup-attempt/claim responses)", () => {
  it('treats {status: "granted"} as granted', () => {
    expect(parseClaimResponseStatus({ status: "granted" })).toBe("granted");
  });

  it('treats {status: "pending"} as pending', () => {
    expect(parseClaimResponseStatus({ status: "pending" })).toBe("pending");
  });

  it("treats malformed/unexpected bodies as pending, never as granted (fail closed)", () => {
    expect(parseClaimResponseStatus(null)).toBe("pending");
    expect(parseClaimResponseStatus(undefined)).toBe("pending");
    expect(parseClaimResponseStatus({})).toBe("pending");
    expect(parseClaimResponseStatus({ status: "granted-typo" })).toBe("pending");
    expect(parseClaimResponseStatus("granted")).toBe("pending");
  });
});
