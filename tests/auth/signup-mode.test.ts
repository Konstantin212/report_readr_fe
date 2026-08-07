import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getSignupMode } from "@/lib/auth/signup-mode";

const ORIGINAL = process.env.AUTH_SIGNUP_MODE;

beforeEach(() => {
  delete process.env.AUTH_SIGNUP_MODE;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AUTH_SIGNUP_MODE;
  else process.env.AUTH_SIGNUP_MODE = ORIGINAL;
});

describe("getSignupMode", () => {
  it("defaults to open when AUTH_SIGNUP_MODE is unset (AC-7)", () => {
    expect(getSignupMode()).toBe("open");
  });

  it("returns restricted when explicitly set (AC-8)", () => {
    process.env.AUTH_SIGNUP_MODE = "restricted";
    expect(getSignupMode()).toBe("restricted");
  });

  it("falls back to open for any other/unrecognized value (fail open by design, matches default)", () => {
    process.env.AUTH_SIGNUP_MODE = "anything-else";
    expect(getSignupMode()).toBe("open");
  });
});
