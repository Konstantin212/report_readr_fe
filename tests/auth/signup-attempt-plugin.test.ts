import { describe, expect, it, vi } from "vitest";

import { claimSignupAttempt, signupAttemptExchange } from "@/lib/auth/signup-attempt-plugin";

type Row = { userId: string; emailVerified: boolean };

/**
 * Fake `Db` covering the `.select().from().innerJoin().where().limit()`
 * chain and the `.update().set().where().returning()` chain that
 * `claimSignupAttempt` exercises. `selectResult` / `updateResult` are
 * configurable per test.
 */
function makeFakeDb(opts: { selectResult: Row[]; updateResult: { id: string }[] }) {
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => opts.selectResult),
          })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => opts.updateResult),
        })),
      })),
    })),
  };
  return db;
}

describe("claimSignupAttempt (design doc §2.2, POST /signup-attempt/claim core logic)", () => {
  it('returns "pending" when no matching row is found (unknown, expired, or already-consumed attemptId)', async () => {
    const db = makeFakeDb({ selectResult: [], updateResult: [] });
    const mintSession = vi.fn();

    const status = await claimSignupAttempt(db as never, "unknown-attempt", mintSession);

    expect(status).toBe("pending");
    expect(mintSession).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns "pending" when the row is found but the account is not yet verified', async () => {
    const db = makeFakeDb({
      selectResult: [{ userId: "user-1", emailVerified: false }],
      updateResult: [],
    });
    const mintSession = vi.fn();

    const status = await claimSignupAttempt(db as never, "attempt-1", mintSession);

    expect(status).toBe("pending");
    expect(mintSession).not.toHaveBeenCalled();
    // Must not attempt to consume an unverified attempt.
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns "granted" and mints a session when the row is found and verified', async () => {
    const db = makeFakeDb({
      selectResult: [{ userId: "user-1", emailVerified: true }],
      updateResult: [{ id: "row-1" }],
    });
    const mintSession = vi.fn(async () => {});

    const status = await claimSignupAttempt(db as never, "attempt-1", mintSession);

    expect(status).toBe("granted");
    expect(mintSession).toHaveBeenCalledTimes(1);
    expect(mintSession).toHaveBeenCalledWith("user-1");
  });

  // One-time-use race guard (design doc §2.2 step 4): a second concurrent
  // claim of an already-consumed attempt must never mint a second
  // session, even though the initial SELECT still found a "pending" row
  // (a benign TOCTOU window closed by the atomic UPDATE ... WHERE
  // consumed_at IS NULL guard, not by the SELECT).
  it('returns "pending", not a second "granted", when the atomic consume UPDATE affects zero rows (lost the race)', async () => {
    const db = makeFakeDb({
      selectResult: [{ userId: "user-1", emailVerified: true }],
      updateResult: [], // another concurrent claim already consumed it
    });
    const mintSession = vi.fn();

    const status = await claimSignupAttempt(db as never, "attempt-1", mintSession);

    expect(status).toBe("pending");
    expect(mintSession).not.toHaveBeenCalled();
  });
});

describe("signupAttemptExchange (plugin shape + rate-limit wiring)", () => {
  it("registers exactly one endpoint at the expected path and a rate-limit rule scoped to that path only", () => {
    const plugin = signupAttemptExchange();

    expect(plugin.id).toBe("signup-attempt-exchange");
    expect(Object.keys(plugin.endpoints ?? {})).toEqual(["claimSignupAttempt"]);

    const rules = plugin.rateLimit ?? [];
    expect(rules).toHaveLength(1);
    const rule = rules[0] as { pathMatcher: (path: string) => boolean; window: number; max: number };
    expect(rule.pathMatcher("/signup-attempt/claim")).toBe(true);
    expect(rule.pathMatcher("/sign-up/email")).toBe(false);
    expect(rule.pathMatcher("/signup-attempt/claim-something-else")).toBe(false);

    // FLAGGED for code-reviewer sign-off (design doc §2.2) — asserting
    // the exact numbers here so any future change to them is a visible,
    // deliberate diff, not a silent drift.
    expect(rule.window).toBe(30);
    expect(rule.max).toBe(15);
  });
});
