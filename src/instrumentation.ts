/**
 * Next.js instrumentation hook — runs once at boot, before any request is
 * handled. Its only job here is a side-effect import of `@/lib/env` so the
 * Zod parse in that module actually runs at boot time.
 *
 * Without this, `lib/env.ts` is imported nowhere in the app (every auth
 * module reads `process.env.X` directly instead — see that file's own
 * comment), so AC-9/AC-10's "when the app boots (Zod parse in env.ts)"
 * framing wouldn't hold. This closes that gap without changing the
 * existing auth-module convention of reading `process.env` directly.
 *
 * Guarded to the Node.js runtime only — `@/lib/env` (and its Zod parse of
 * server-only secrets) has no business running in the Edge runtime, and
 * `register()` is invoked once per runtime Next.js instruments.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
