import { describe, expect, it, vi } from "vitest";

// Isolate the hook's *branching* (restricted vs. open) from
// isEmailAllowedToSignIn's own DB-backed lookup — that function already
// has its own unit tests (tests/auth/allowlist.test.ts); this file only
// needs to prove setup.ts's databaseHooks wiring calls it correctly, not
// re-verify its internals against a real DB.
vi.mock("@/lib/auth/allowlist", () => ({
  isEmailAllowedToSignIn: vi.fn(async (email: string) => email === "allowed@example.com"),
}));

/**
 * Smoke test for the assembled `betterAuth({...})` config in
 * src/lib/auth/setup.ts. Deliberately does NOT hit the DB — constructing
 * `betterAuth()` doesn't eagerly connect (drizzleAdapter/getDb only touch
 * the network when a query actually executes), so this just guards
 * against config-shape regressions (a key silently renamed/removed) in
 * the pieces that are otherwise only exercised at runtime.
 */
describe("auth setup (smoke)", () => {
  it("assembles emailAndPassword / emailVerification / rateLimit exactly as designed", async () => {
    const { auth } = await import("@/lib/auth/setup");
    const options = auth.options as unknown as Record<string, unknown>;

    const emailAndPassword = options.emailAndPassword as Record<string, unknown>;
    expect(emailAndPassword.enabled).toBe(true);
    // Email-verification-gate design doc §0/§9 build step 2: flipped
    // true — blocks sign-in/access until the account is verified
    // (AC-6/AC-7) and, as a verified side effect, disables auto-sign-in
    // on brand-new sign-ups (AC-1) and makes duplicate-email sign-up
    // return the same generic response as a genuine sign-up (AC-4).
    expect(emailAndPassword.requireEmailVerification).toBe(true);
    expect(emailAndPassword.autoSignIn).toBe(true);
    expect(emailAndPassword.minPasswordLength).toBe(8);
    expect(emailAndPassword.maxPasswordLength).toBe(128);
    expect(emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
    expect(emailAndPassword.resetPasswordTokenExpiresIn).toBe(3600);
    expect(typeof emailAndPassword.sendResetPassword).toBe("function");

    const emailVerification = options.emailVerification as Record<string, unknown>;
    expect(emailVerification.sendOnSignUp).toBe(true);
    expect(emailVerification.expiresIn).toBe(3600);
    expect(typeof emailVerification.sendVerificationEmail).toBe("function");
    // AC-10: the tab that clicks the verification link lands signed in,
    // via better-auth's own auto-sign-in-after-verification behavior.
    expect(emailVerification.autoSignInAfterVerification).toBe(true);

    expect((options.rateLimit as Record<string, unknown>).enabled).toBe(true);

    // Design doc §2.2: signupAttemptId is a `returned: false` passthrough
    // field — never appears in any sign-up response (genuine or
    // synthetic-duplicate), only used to bind the cross-device
    // correlation row in databaseHooks.user.create.after below.
    const userConfig = options.user as { additionalFields?: Record<string, unknown> };
    expect(userConfig.additionalFields?.signupAttemptId).toEqual({
      type: "string",
      required: false,
      returned: false,
    });

    const hooks = options.databaseHooks as {
      user: { create: { before: unknown; after: unknown } };
      account: { create: { before: unknown } };
    };
    expect(typeof hooks.user.create.before).toBe("function");
    expect(typeof hooks.user.create.after).toBe("function");
    expect(typeof hooks.account.create.before).toBe("function");

    // AC-13: the allowlist/restricted-mode check must only ever fire on
    // user *creation*, never on sign-in — an existing user re-authenticating
    // must never be re-checked against the allowlist (no re-approval, no
    // forced migration). Guards against a future change accidentally
    // wiring the check into a `session`/sign-in hook instead of (or in
    // addition to) `user.create.before`.
    expect(Object.keys(hooks as Record<string, unknown>).sort()).toEqual(["account", "user"]);
    expect(Object.keys((hooks as Record<string, { create: unknown }>).user)).toEqual(["create"]);
    expect(Object.keys(hooks.user.create).sort()).toEqual(["after", "before"]);
  });

  it("nulls out OAuth tokens on account.create.before but leaves credential accounts alone (§24)", async () => {
    const { auth } = await import("@/lib/auth/setup");
    const options = auth.options as unknown as {
      databaseHooks: { account: { create: { before: (a: Record<string, unknown>) => Promise<unknown> } } };
    };
    const before = options.databaseHooks.account.create.before;

    const oauthResult = (await before({
      providerId: "google",
      accessToken: "secret-access",
      refreshToken: "secret-refresh",
      idToken: "secret-id",
    })) as { data: Record<string, unknown> };
    expect(oauthResult.data.accessToken).toBeNull();
    expect(oauthResult.data.refreshToken).toBeNull();
    expect(oauthResult.data.idToken).toBeNull();

    const credentialResult = (await before({
      providerId: "credential",
      password: "hashed-password",
    })) as { data: Record<string, unknown> };
    expect(credentialResult.data.password).toBe("hashed-password");
  });

  it("restricted mode still enforces the allowlist; open (default) mode does not (AC-7/AC-8)", async () => {
    const original = process.env.AUTH_SIGNUP_MODE;
    try {
      delete process.env.AUTH_SIGNUP_MODE;
      const { auth } = await import("@/lib/auth/setup");
      const options = auth.options as unknown as {
        databaseHooks: { user: { create: { before: (u: { email: string }) => Promise<unknown> } } };
      };
      const before = options.databaseHooks.user.create.before;

      // Open (default): account creation succeeds even for an email the
      // (mocked) allowlist would reject — the allowlist is never consulted.
      await expect(before({ email: "nobody-knows-this-one@example.com" })).resolves.toBeDefined();

      process.env.AUTH_SIGNUP_MODE = "restricted";
      await expect(before({ email: "nobody-knows-this-one@example.com" })).rejects.toThrow(
        /not authorized/i,
      );
      // ...but an allowlisted email still succeeds under restricted mode.
      await expect(before({ email: "allowed@example.com" })).resolves.toBeDefined();
    } finally {
      if (original === undefined) delete process.env.AUTH_SIGNUP_MODE;
      else process.env.AUTH_SIGNUP_MODE = original;
    }
  });
});
