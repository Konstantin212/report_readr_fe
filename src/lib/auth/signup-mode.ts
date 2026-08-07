/**
 * Two independently toggleable things (see AC doc §4) — this module owns
 * only the first: whether sign-up is open to anyone or gated by the
 * pre-existing allowlist. It deliberately reads `process.env` directly
 * rather than importing the Zod-parsed `@/lib/env`, matching every other
 * auth-module file's existing convention (`allowlist.ts`, `admin.ts`,
 * `setup.ts`) — see docs/superpowers/specs/2026-08-05-open-signup-design.md §2.
 */
export type SignupMode = "open" | "restricted";

export function getSignupMode(): SignupMode {
  return process.env.AUTH_SIGNUP_MODE === "restricted" ? "restricted" : "open";
}
