import { describe, it, expect } from "vitest";
import { classifyQuoteFreshness } from "@/lib/quotes/freshness";

/**
 * The freshness classifier exists so we can show "as of …" with a
 * colour cue on positions, and so the cron is no longer the only
 * thing standing between the user and silently-stale P/L numbers.
 *
 * Rule (calendar days, no holiday calendar):
 *   - 0..1  → "fresh"  (quote from today or yesterday)
 *   - 2..5  → "ok"     (long weekend, occasional missed cron run)
 *   - >5    → "stale"  (something is broken — surface a warning chip)
 *   - null  → "missing"
 */

describe("classifyQuoteFreshness", () => {
  const today = "2026-06-08"; // a Monday

  it("returns 'fresh' for today's quote", () => {
    expect(classifyQuoteFreshness("2026-06-08", today)).toBe("fresh");
  });

  it("returns 'fresh' for yesterday's quote", () => {
    expect(classifyQuoteFreshness("2026-06-07", today)).toBe("fresh");
  });

  it("returns 'ok' for a Friday quote read on Monday (weekend gap)", () => {
    expect(classifyQuoteFreshness("2026-06-05", today)).toBe("ok");
  });

  it("returns 'ok' for a quote up to 5 days old (long weekend / holiday)", () => {
    expect(classifyQuoteFreshness("2026-06-03", today)).toBe("ok");
  });

  it("returns 'stale' once a quote is more than 5 days old", () => {
    expect(classifyQuoteFreshness("2026-06-02", today)).toBe("stale");
    expect(classifyQuoteFreshness("2026-05-25", today)).toBe("stale");
  });

  it("returns 'missing' for null / undefined dates", () => {
    expect(classifyQuoteFreshness(null, today)).toBe("missing");
    expect(classifyQuoteFreshness(undefined, today)).toBe("missing");
  });

  it("returns 'missing' for unparseable date strings", () => {
    expect(classifyQuoteFreshness("not-a-date", today)).toBe("missing");
  });
});
