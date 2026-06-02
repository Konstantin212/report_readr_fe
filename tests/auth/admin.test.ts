import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _resetAdminCacheForTests, getAdminEmails, isAdminEmail } from "@/lib/auth/admin";

const ORIGINAL = process.env.ADMIN_EMAILS;

beforeEach(() => {
  _resetAdminCacheForTests();
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL;
  _resetAdminCacheForTests();
});

describe("admin email env loader", () => {
  it("fails closed when ADMIN_EMAILS is unset", () => {
    delete process.env.ADMIN_EMAILS;
    expect(getAdminEmails()).toEqual([]);
    expect(isAdminEmail("any@example.com")).toBe(false);
  });

  it("parses a single email", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isAdminEmail("owner@example.com")).toBe(true);
    expect(isAdminEmail("Owner@Example.com")).toBe(true);
    expect(isAdminEmail("intruder@example.com")).toBe(false);
  });

  it("parses multiple comma-separated emails", () => {
    process.env.ADMIN_EMAILS = "owner@example.com, partner@example.com ";
    expect(isAdminEmail("partner@example.com")).toBe(true);
    expect(isAdminEmail("owner@example.com")).toBe(true);
    expect(isAdminEmail("intruder@example.com")).toBe(false);
  });

  it("normalizes case and trims whitespace on lookup", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isAdminEmail(" Owner@Example.com ")).toBe(true);
  });

  it("returns false for missing email", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });
});
