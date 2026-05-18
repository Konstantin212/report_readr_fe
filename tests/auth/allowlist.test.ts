import { describe, expect, it } from "vitest";

import { parseAuthorizedEmails, isEmailAuthorized } from "@/lib/auth/allowlist";

describe("auth email allowlist", () => {
  it("normalizes configured emails and ignores blanks", () => {
    expect(parseAuthorizedEmails(" You@Example.com, , girlfriend@example.com ")).toEqual([
      "you@example.com",
      "girlfriend@example.com",
    ]);
  });

  it("rejects emails that are not explicitly allowlisted", () => {
    const allowlist = parseAuthorizedEmails("you@example.com,girlfriend@example.com");

    expect(isEmailAuthorized("you@example.com", allowlist)).toBe(true);
    expect(isEmailAuthorized("intruder@example.com", allowlist)).toBe(false);
  });
});
