/**
 * Process-local token-bucket. Lives in the function instance memory —
 * survives across requests within a Fluid Compute instance but resets
 * on cold start. Good enough to keep an authenticated session from
 * spamming an endpoint; not enough to protect against a distributed
 * abuser, which isn't the threat model here.
 *
 * For a 5-user app this is the sweet spot. If we ever need stricter
 * limits, swap the Map for Upstash Redis.
 */

const buckets = new Map<string, number[]>();

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(key: string, maxHits: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const hits = buckets.get(key) ?? [];
  const cutoff = now - windowMs;
  const recent = hits.filter((t) => t > cutoff);
  if (recent.length >= maxHits) {
    const oldest = recent[0];
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    return { ok: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { ok: true };
}

// Test only.
export function _resetRateLimitForTests(): void {
  buckets.clear();
}
