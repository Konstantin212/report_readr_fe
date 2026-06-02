import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _resetRateLimitForTests, checkRateLimit } from "@/lib/rate-limit";

beforeEach(() => _resetRateLimitForTests());
afterEach(() => _resetRateLimitForTests());

describe("rate-limit (process-local token bucket)", () => {
  it("allows hits up to the cap, then rejects with retry-after", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("k", 3, 60_000).ok).toBe(true);
    }
    const blocked = checkRateLimit("k", 3, 60_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("isolates buckets by key", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("a", 3, 60_000);
    expect(checkRateLimit("a", 3, 60_000).ok).toBe(false);
    expect(checkRateLimit("b", 3, 60_000).ok).toBe(true);
  });
});
