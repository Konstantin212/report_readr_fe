import type { Platform } from "@/components/onboarding/platform-card";

export type TourNextAction = "upload" | "settings" | "explore";

/** In-app paths `finish()` may navigate to. Literal so `typedRoutes` can check them. */
export type TourDestination = "/upload" | "/settings?section=crypto";

/**
 * AC-OC0.4 — the value handed to `trackOnboardingTourCompleted`. This is an
 * analytics allow-list member and must stay one of the three literals, even
 * though the Coinbase destination URL gained a query string (AC-OC1.5).
 */
export function tourNextAction(selected: ReadonlySet<Platform>): TourNextAction {
  if (selected.has("ibkr") || selected.has("freedom")) return "upload";
  if (selected.has("coinbase")) return "settings";
  return "explore";
}

/**
 * AC-OC1.5 — where `finish()` navigates. Deliberately a SEPARATE function from
 * the analytics value: bare `/settings` defaults to `section=brokers`, which
 * shows "No broker accounts yet" — the opposite of the Coinbase user's task.
 * `null` means "stay on this page".
 */
export function tourDestination(action: TourNextAction): TourDestination | null {
  switch (action) {
    case "upload":
      return "/upload";
    case "settings":
      return "/settings?section=crypto";
    case "explore":
      return null;
  }
}
