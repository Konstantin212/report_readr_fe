import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = {
  DATABASE_URL: "postgresql://user:pass@host/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

/**
 * `src/lib/env.ts` performs an eager, throwing `envSchema.parse(process.env)`
 * at module *import* time (correct for its real job: failing fast at app
 * boot, wired in via `src/instrumentation.ts` — unlike e.g.
 * `src/lib/db/client.ts`'s `getDb()`, which soft-falls-back when
 * `DATABASE_URL` is unset). That means a bare `import { envSchema } from
 * "@/lib/env"` throws a `ZodError` and fails this whole file's collection
 * whenever the test process's `process.env` doesn't already carry a valid
 * `DATABASE_URL` / `BETTER_AUTH_SECRET` — true for most local/CI runs, since
 * `vitest.config.ts` does not load `.env.local` the way `next dev`/`next
 * build` do.
 *
 * Fix: stub just enough of `process.env` for the one-time import to
 * succeed, via a *dynamic* import inside `beforeAll` (a static top-level
 * import is hoisted before any test code can run, so stubbing first only
 * works with `import()`), then restore the original values immediately
 * afterward. This is deliberately scoped to this file and reverted right
 * away — a global stub (e.g. in a shared Vitest `setupFiles` entry) would
 * make `DATABASE_URL` look "set" to every other test file too, silently
 * breaking the `it.skipIf(!process.env.DATABASE_URL)` real-DB gating used by
 * `tests/api/cron/auth-cleanup.test.ts` and `tests/deploy/neon-smoke.test.ts`
 * (confirmed by trying that approach first: it made those suites attempt a
 * real connection to the stub's fake host and fail).
 */
let envSchema: typeof import("@/lib/env").envSchema;
const savedDatabaseUrl = process.env.DATABASE_URL;
const savedSecret = process.env.BETTER_AUTH_SECRET;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = BASE.DATABASE_URL;
  if (!process.env.BETTER_AUTH_SECRET) process.env.BETTER_AUTH_SECRET = BASE.BETTER_AUTH_SECRET;
  ({ envSchema } = await import("@/lib/env"));
});

afterAll(() => {
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
  if (savedSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = savedSecret;
});

describe("env schema (open self-service sign-up)", () => {
  it("boots without AUTHORIZED_EMAILS set (AC-9)", () => {
    const result = envSchema.safeParse(BASE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.AUTHORIZED_EMAILS).toBeUndefined();
      expect(result.data.AUTH_SIGNUP_MODE).toBe("open");
      expect(result.data.AUTH_CLEANUP_DELETE_ENABLED).toBe("false");
    }
  });

  it("still accepts AUTHORIZED_EMAILS when a deployment sets it (AC-10, backward compat)", () => {
    const result = envSchema.safeParse({ ...BASE, AUTHORIZED_EMAILS: "you@example.com" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.AUTHORIZED_EMAILS).toBe("you@example.com");
  });

  it("accepts AUTH_SIGNUP_MODE=restricted explicitly", () => {
    const result = envSchema.safeParse({ ...BASE, AUTH_SIGNUP_MODE: "restricted" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.AUTH_SIGNUP_MODE).toBe("restricted");
  });

  it("rejects an unrecognized AUTH_SIGNUP_MODE value", () => {
    const result = envSchema.safeParse({ ...BASE, AUTH_SIGNUP_MODE: "public" });
    expect(result.success).toBe(false);
  });

  it("accepts AUTH_CLEANUP_DELETE_ENABLED=true explicitly", () => {
    const result = envSchema.safeParse({ ...BASE, AUTH_CLEANUP_DELETE_ENABLED: "true" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.AUTH_CLEANUP_DELETE_ENABLED).toBe("true");
  });

  it("still requires DATABASE_URL and BETTER_AUTH_SECRET", () => {
    expect(envSchema.safeParse({}).success).toBe(false);
    expect(envSchema.safeParse({ DATABASE_URL: BASE.DATABASE_URL }).success).toBe(false);
  });
});
