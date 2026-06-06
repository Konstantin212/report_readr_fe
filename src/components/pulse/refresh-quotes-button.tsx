"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Result = {
  requested?: number;
  inserted?: number;
  unpriced?: string[];
  skipped?: number;
  bySource?: Record<string, number>;
};

/**
 * Manual quote-cache refresh. Sits next to "Backfill historical FX" in
 * the Currency & FX card. Pings the admin endpoint (same logic as the
 * daily cron) and refreshes the page so the new quote dates land in
 * the position views.
 */
export function RefreshQuotesButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/refresh-quotes", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      setResult(body as Result);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-3 flex-wrap">
      <button
        onClick={run}
        disabled={pending}
        className="border border-mint/40 text-mint font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md hover:bg-mint/10 disabled:opacity-50"
      >
        {pending ? "Refreshing…" : "Refresh quotes"}
      </button>
      {result && (
        <div className="font-mono text-[11px] text-muted">
          {result.inserted}/{result.requested} priced
          {result.bySource ? (
            <span className="ml-2 text-dim">
              {(result.bySource.twelveData ?? 0) > 0 && <> · td {result.bySource.twelveData}</>}
              {(result.bySource.yahoo ?? 0) > 0 && <> · yahoo {result.bySource.yahoo}</>}
              {(result.bySource.stooq ?? 0) > 0 && <> · stooq {result.bySource.stooq}</>}
              {(result.bySource.none ?? 0) > 0 && <> · <span className="text-bad">none {result.bySource.none}</span></>}
            </span>
          ) : null}
        </div>
      )}
      {error && <div className="font-mono text-[11px] text-bad">{error}</div>}
    </div>
  );
}
