import { z } from "zod";

/**
 * Exported (not just the parsed `env` below) so tests can validate the
 * schema's shape/defaults with fixture objects, independent of whatever
 * happens to be in `process.env` when the test runs — see
 * `tests/lib/env.test.ts`.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().optional(),
  // Was z.string().min(1) (required) — open self-service sign-up (default
  // AUTH_SIGNUP_MODE="open" below) no longer needs a bootstrap allowlist to
  // boot. Kept optional, not deleted: AUTH_SIGNUP_MODE="restricted"
  // deployments still read this as a bootstrap admin allowlist — see
  // src/lib/auth/allowlist.ts.
  AUTHORIZED_EMAILS: z.string().optional(),
  // Default "open": zero-config, matches the feature's stated goal (see
  // docs/superpowers/specs/2026-08-05-open-signup-design.md §2). Set to
  // "restricted" to re-enable the pre-existing allowlist gate.
  AUTH_SIGNUP_MODE: z.enum(["open", "restricted"]).default("open"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  // Gates the destructive half of the auth-cleanup cron (see
  // src/lib/auth/auth-cleanup.ts, src/app/api/cron/auth-cleanup/route.ts,
  // §23 of the design doc). Defaults
  // to "false" (log-only dry run) — must be explicitly flipped to "true"
  // after reviewing the dry-run candidate list.
  AUTH_CLEANUP_DELETE_ENABLED: z.enum(["true", "false"]).default("false"),
});

export const env = envSchema.parse(process.env);
