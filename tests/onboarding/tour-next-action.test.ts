import { describe, expect, it } from "vitest";

import type { Platform } from "@/components/onboarding/platform-card";
import { tourDestination, tourNextAction } from "@/lib/onboarding/tour-next-action";

const sel = (...platforms: Platform[]): ReadonlySet<Platform> => new Set(platforms);

/**
 * AC-OC0.4 — `tourNextAction` is the value handed to
 * `trackOnboardingTourCompleted`, so it must stay inside the analytics
 * allow-list even though the Coinbase *destination* gained a query string
 * (AC-OC1.5). The two are deliberately separate functions.
 */
describe("tourNextAction", () => {
  it("returns 'upload' for IBKR", () => {
    expect(tourNextAction(sel("ibkr"))).toBe("upload");
  });

  it("returns 'upload' for Freedom24", () => {
    expect(tourNextAction(sel("freedom"))).toBe("upload");
  });

  it("returns the literal 'settings' for the Coinbase-only path (AC-OC0.4)", () => {
    expect(tourNextAction(sel("coinbase"))).toBe("settings");
  });

  it("prefers upload when a statement broker is selected alongside Coinbase", () => {
    expect(tourNextAction(sel("ibkr", "coinbase"))).toBe("upload");
  });

  it("returns 'explore' when nothing was selected", () => {
    expect(tourNextAction(sel())).toBe("explore");
  });
});

describe("tourDestination", () => {
  it("deep-links the Coinbase path to the crypto section (AC-OC1.5)", () => {
    expect(tourDestination("settings")).toBe("/settings?section=crypto");
  });

  it("sends statement users to the upload page", () => {
    expect(tourDestination("upload")).toBe("/upload");
  });

  it("stays on the current page when the user just wants to explore", () => {
    expect(tourDestination("explore")).toBeNull();
  });
});
