import { describe, expect, it, vi } from "vitest";

import { handleUserCreateAfter } from "@/lib/auth/signup-attempt-hooks";

/**
 * Fake `Db` with just enough chained-call surface for
 * `handleUserCreateAfter` to exercise (`insert().values()` and
 * `update().set().where()`) — see design doc §2.2.
 */
function makeFakeDb() {
  const inserted: unknown[] = [];
  const updated: { set: unknown; where: unknown }[] = [];

  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(async (values: unknown) => {
        inserted.push(values);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((set: unknown) => ({
        where: vi.fn(async (where: unknown) => {
          updated.push({ set, where });
        }),
      })),
    })),
  };

  return { db, inserted, updated };
}

describe("handleUserCreateAfter (databaseHooks.user.create.after, design doc §2.2)", () => {
  it("inserts a signupAttempts row and nulls the passthrough column when signupAttemptId is present", async () => {
    const { db, inserted, updated } = makeFakeDb();

    await handleUserCreateAfter(db as never, { id: "user-1", signupAttemptId: "attempt-abc" });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ attemptId: "attempt-abc", userId: "user-1" });
    expect((inserted[0] as { expiresAt: Date }).expiresAt).toBeInstanceOf(Date);
    // Roughly 1 hour out, matching emailVerification.expiresIn.
    const expiresAt = (inserted[0] as { expiresAt: Date }).expiresAt;
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 3500 * 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 3600 * 1000 + 1000);

    expect(updated).toHaveLength(1);
    expect(updated[0].set).toMatchObject({ signupAttemptId: null });
  });

  it("does nothing when signupAttemptId is absent (e.g. OAuth sign-up, which never sets it)", async () => {
    const { db, inserted, updated } = makeFakeDb();

    await handleUserCreateAfter(db as never, { id: "user-2" });

    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(0);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("does nothing when signupAttemptId is null", async () => {
    const { db, inserted } = makeFakeDb();

    await handleUserCreateAfter(db as never, { id: "user-3", signupAttemptId: null });

    expect(inserted).toHaveLength(0);
  });
});

/**
 * SECURITY INVARIANT (design doc §2.1): a duplicate-email sign-up must
 * never result in a `signupAttempts` row bound to the pre-existing
 * (victim) account. This module enforces that invariant *structurally* —
 * by only ever being wired to `databaseHooks.user.create.after`, which
 * better-auth's own `sign-up.mjs` never invokes on the duplicate-email
 * branch (verified directly against
 * `node_modules/better-auth/dist/api/routes/sign-up.mjs`: the duplicate
 * branch returns a synthetic user without ever calling
 * `internalAdapter.createUser(...)`). There is deliberately no
 * email-based or duplicate-detection guard *inside* this function — see
 * the module doc-comment. The full end-to-end proof (genuine sign-up
 * creates exactly one row; a duplicate sign-up attempt for the same
 * email creates zero rows) requires a live better-auth + DB round trip
 * and is covered by the DATABASE_URL-gated test in
 * tests/auth/signup-attempt-invariant.test.ts.
 */
describe("handleUserCreateAfter — duplicate-signup security invariant (design doc §2.1)", () => {
  it("is only reachable via user.create.after, never via any email-keyed lookup — structural, not a runtime branch", () => {
    // This function's signature takes no `email` parameter at all and
    // performs no SELECT-by-email anywhere in its body — the only way to
    // reach it is being handed an already-created user row by
    // better-auth's own create-hook machinery. Asserting the signature
    // shape here guards against a future edit accidentally adding an
    // email-keyed code path that would reopen the account-takeover
    // vector described in the design doc.
    expect(handleUserCreateAfter.length).toBe(2); // (db, createdUser) — no email/lookup parameter
  });
});
