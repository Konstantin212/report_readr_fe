const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

/**
 * Best-effort in-memory per-user rate limit for feedback submissions.
 *
 * This is per-instance (module-level `Map`), not distributed — on
 * multi-instance deployments each instance tracks its own budget. It is
 * intended to deter accidental re-submit spam from a logged-in user, NOT
 * as a hard security boundary.
 */
const hits = new Map<string, number[]>();

export function allowFeedback(userId: string, now: number = Date.now()): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

// Test-only. Clears all recorded hits.
export function _resetFeedbackRateLimit(): void {
  hits.clear();
}
