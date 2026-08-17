import { beforeEach, describe, expect, it } from "vitest";
import { allowFeedback, _resetFeedbackRateLimit } from "@/lib/feedback/rate-limit";

beforeEach(() => {
  _resetFeedbackRateLimit();
});

describe("allowFeedback", () => {
  it("allows 5 sends in window blocks 6th", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) expect(allowFeedback("u1", now)).toBe(true);
    expect(allowFeedback("u1", now)).toBe(false);
  });

  it("frees budget once window passes", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) allowFeedback("u1", t0);
    expect(allowFeedback("u1", t0)).toBe(false);
    expect(allowFeedback("u1", t0 + 60_001)).toBe(true);
  });

  it("tracks users independently", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) allowFeedback("u1", now);
    expect(allowFeedback("u2", now)).toBe(true);
  });
});
