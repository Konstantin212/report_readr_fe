import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of the Authorization header against
 * CRON_SECRET. Plain `!==` short-circuits per-byte; over a network the
 * jitter usually drowns the signal but it's a textbook footgun and the
 * fix is two lines.
 *
 * Returns false (never throws) on missing env, missing header, length
 * mismatch, or value mismatch.
 */
export function hasValidCronSecret(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const expectedHeader = `Bearer ${expected}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expectedHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
