import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Platform } from "@/components/onboarding/platform-card";
import {
  tourDestination,
  tourNextAction,
  type TourNextAction,
} from "@/lib/onboarding/tour-next-action";

/**
 * The seam between the tour's analytics literal and its navigation target.
 * `tour-next-action.test.ts` covers each function alone; this file covers the
 * two things that only exist where they meet:
 *
 *  - AC-OC0.4 — widening the destination URL must NOT widen the event's
 *    property allow-list, and this feature must add no new events.
 *  - AC-OC1.7 — the ReadyCard Coinbase link routes through `finish()` rather
 *    than navigating raw, so completion is still tracked and the tour is
 *    dismissed instead of auto-opening again on the next dashboard visit.
 *
 * The wiring assertions read component source rather than a rendered DOM, for
 * the reason documented at `tests/onboarding/copy.test.ts:6-36` (Vitest runs
 * `environment: "node"`; `.tsx` is not collected). Everything expressible as
 * pure logic is a real unit test below instead.
 */
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const TOUR_SRC = readSrc("src/components/onboarding/welcome-tour.tsx");

const ALL_PLATFORMS: Platform[] = ["ibkr", "freedom", "coinbase"];

/** Every subset of the three selector platforms, smallest first. */
function everySelection(): Platform[][] {
  return Array.from({ length: 1 << ALL_PLATFORMS.length }, (_, mask) =>
    ALL_PLATFORMS.filter((_p, i) => mask & (1 << i)),
  ).sort((a, b) => a.length - b.length);
}

describe("AC-OC0.4: the completion event's allow-list is not widened", () => {
  it("maps every possible selection to one of the three allowed literals", () => {
    const allowed: TourNextAction[] = ["upload", "settings", "explore"];
    for (const platforms of everySelection()) {
      expect(allowed).toContain(tourNextAction(new Set(platforms)));
    }
  });

  it("emits the analytics literal, not the destination URL", () => {
    // The regression this guards: someone "simplifying" finish() by passing
    // tourDestination()'s value straight to the tracker.
    expect(TOUR_SRC).toContain("const nextAction = tourNextAction(selected);");
    expect(TOUR_SRC).toContain("trackOnboardingTourCompleted(nextAction);");
    expect(TOUR_SRC).not.toMatch(/trackOnboardingTourCompleted\((?!nextAction\))/);
  });

  it("adds no onboarding event to the analytics catalogue", () => {
    const events = readSrc("src/lib/analytics-events.ts");
    const onboardingExports = [...events.matchAll(/^export function (trackOnboarding\w+)/gm)].map(
      (m) => m[1],
    );
    expect(onboardingExports).toEqual([
      "trackOnboardingTourStarted",
      "trackOnboardingPlatformToggled",
      "trackOnboardingTourDismissed",
      "trackOnboardingTourCompleted",
    ]);
    expect(events).toContain('send("onboarding_tour_completed", { nextAction });');
  });

  it("keeps the new onboarding modules out of the analytics boundary entirely", () => {
    for (const file of [
      "src/lib/onboarding/broker-instructions.ts",
      "src/lib/onboarding/first-run.ts",
      "src/lib/onboarding/tour-next-action.ts",
      "src/components/onboarding/instruction-copy.tsx",
      "src/components/onboarding/first-run-card.tsx",
      "src/components/pulse/export-instructions.tsx",
    ]) {
      // Imports, not prose: `tour-next-action.ts` legitimately *documents*
      // the analytics allow-list in a comment without emitting anything.
      expect(readSrc(file)).not.toMatch(/^import .*(analytics-events|@vercel\/analytics)/m);
      expect(readSrc(file)).not.toMatch(/\btrack[A-Z]\w*\(/);
    }
  });
});

describe("AC-OC1.5: the analytics literal and the destination are paired correctly", () => {
  const cases: { platforms: Platform[]; action: TourNextAction; to: string | null }[] = [
    { platforms: [], action: "explore", to: null },
    { platforms: ["ibkr"], action: "upload", to: "/upload" },
    { platforms: ["freedom"], action: "upload", to: "/upload" },
    { platforms: ["coinbase"], action: "settings", to: "/settings?section=crypto" },
    { platforms: ["ibkr", "freedom"], action: "upload", to: "/upload" },
    { platforms: ["ibkr", "coinbase"], action: "upload", to: "/upload" },
    { platforms: ["freedom", "coinbase"], action: "upload", to: "/upload" },
    {
      platforms: ["ibkr", "freedom", "coinbase"],
      action: "upload",
      to: "/upload",
    },
  ];

  for (const { platforms, action, to } of cases) {
    it(`[${platforms.join(", ") || "nothing"}] → "${action}" → ${to ?? "no navigation"}`, () => {
      const resolved = tourNextAction(new Set(platforms));
      expect(resolved).toBe(action);
      expect(tourDestination(resolved)).toBe(to);
    });
  }

  it("never sends a Coinbase-only user to bare /settings, which defaults to brokers", () => {
    // `settings/page.tsx` defaults an absent `section` to "brokers", whose
    // empty state reads "No broker accounts yet" — the opposite of the task.
    expect(tourDestination(tourNextAction(new Set<Platform>(["coinbase"])))).not.toBe("/settings");
    expect(TOUR_SRC).not.toContain('router.push("/settings")');
  });
});

describe("AC-OC1.7: the ReadyCard Coinbase link completes the tour instead of navigating raw", () => {
  it("passes finish() down to ReadyCard", () => {
    expect(TOUR_SRC).toContain("<ReadyCard selected={selected} onFinish={finish} />");
    expect(TOUR_SRC).toContain("onFinish: () => void");
  });

  it("suppresses the raw navigation and calls onFinish instead", () => {
    // Narrowed to the ReadyCard body so an onClick elsewhere cannot satisfy it.
    const readyCard = TOUR_SRC.slice(TOUR_SRC.indexOf("function ReadyCard"));
    const anchor = readyCard.slice(
      readyCard.indexOf('href="/settings?section=crypto"'),
      readyCard.indexOf("</a>"),
    );
    expect(anchor).toContain("onClick");
    expect(anchor).toContain("e.preventDefault();");
    expect(anchor).toContain("onFinish();");
  });

  it("still points at the crypto section rather than bare /settings", () => {
    expect(TOUR_SRC).toContain('href="/settings?section=crypto"');
    expect(TOUR_SRC).not.toContain('href="/settings"');
  });
});
