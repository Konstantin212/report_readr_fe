export type QuoteFreshness = "fresh" | "ok" | "stale" | "missing";

/**
 * Classify how recent a cached quote is. Used by the position views to
 * show an "as of …" badge with a colour cue, and to surface a warning
 * when the quote cron has fallen behind (the original symptom that
 * prompted this helper was Stooq silently failing for two trading days
 * and our P/L numbers drifting from the broker's by a full session).
 *
 * Calendar-day based, no holiday calendar: 1-day quotes look fresh,
 * a Friday read on Monday counts as "ok", anything older than five
 * days is "stale" and should be flagged in the UI.
 */
export function classifyQuoteFreshness(
  quoteDate: string | null | undefined,
  today: string,
): QuoteFreshness {
  if (!quoteDate) return "missing";
  const q = Date.parse(`${quoteDate}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(q) || !Number.isFinite(t)) return "missing";
  const days = Math.round((t - q) / 86_400_000);
  if (days <= 1) return "fresh";
  if (days <= 5) return "ok";
  return "stale";
}
