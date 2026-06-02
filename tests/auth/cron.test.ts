import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hasValidCronSecret } from "@/lib/auth/cron";

const ORIGINAL = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "the-real-secret";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

function reqWith(authorization?: string): Request {
  return new Request("https://example.com/api/cron/whatever", {
    headers: authorization ? { authorization } : {},
  });
}

describe("hasValidCronSecret (constant-time bearer check)", () => {
  it("accepts the exact Bearer token", () => {
    expect(hasValidCronSecret(reqWith("Bearer the-real-secret"))).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(hasValidCronSecret(reqWith("Bearer not-the-secret"))).toBe(false);
  });

  it("rejects a shorter prefix that would match in a naive comparison", () => {
    expect(hasValidCronSecret(reqWith("Bearer the-real"))).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(hasValidCronSecret(reqWith(undefined))).toBe(false);
  });

  it("rejects when CRON_SECRET is unset (fails closed)", () => {
    delete process.env.CRON_SECRET;
    expect(hasValidCronSecret(reqWith("Bearer the-real-secret"))).toBe(false);
  });
});
