import { Card } from "./card";
import type { QuoteStatusRow } from "@/lib/data/quote-status";
import { classifyQuoteFreshness } from "@/lib/quotes/freshness";

/**
 * Per-symbol freshness table on Settings → Tax & currency. Lets the
 * user see at a glance which holdings the paged cron has touched
 * recently vs which are lagging (typically the FMP-paywalled / TD-
 * rate-limited slow lane). Sorted stalest-first by the data accessor
 * so problems sit at the top.
 */
export function QuoteStatusTable({ rows }: { rows: QuoteStatusRow[] }) {
  if (rows.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const dtFmt = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  // Quick summary counts for the header chip.
  let fresh = 0, ok = 0, stale = 0, missing = 0;
  for (const r of rows) {
    const level = classifyQuoteFreshness(r.quoteDate, today);
    if (level === "fresh") fresh++;
    else if (level === "ok") ok++;
    else if (level === "stale") stale++;
    else missing++;
  }

  return (
    <Card>
      <div className="flex justify-between items-baseline mb-3 flex-wrap gap-2">
        <div className="font-semibold text-base">Quote freshness</div>
        <div className="font-mono text-[11px] text-muted">
          <span className="text-mint">{fresh} fresh</span>
          {ok > 0 && <> · <span className="text-amber">{ok} ok</span></>}
          {stale > 0 && <> · <span className="text-bad">{stale} stale</span></>}
          {missing > 0 && <> · <span className="text-dim">{missing} missing</span></>}
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden sm:grid grid-cols-[1fr_1fr_1.2fr_0.8fr] gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
        <span>Ticker</span>
        <span className="text-right">Last close</span>
        <span className="text-right">Quote · synced (UTC)</span>
        <span className="text-right">Freshness</span>
      </div>

      <div className="divide-y divide-border">
        {rows.map((r) => {
          const level = classifyQuoteFreshness(r.quoteDate, today);
          const dotColor =
            level === "stale" ? "bg-bad"
            : level === "ok" ? "bg-amber"
            : level === "missing" ? "bg-dim"
            : "bg-mint";
          const textColor =
            level === "stale" ? "text-bad"
            : level === "ok" ? "text-amber"
            : level === "missing" ? "text-dim"
            : "text-mint";
          return (
            <div
              key={r.symbol}
              className="grid grid-cols-[1fr_1fr] sm:grid-cols-[1fr_1fr_1.2fr_0.8fr] gap-2 px-3 py-2.5 items-baseline font-mono text-[12px]"
            >
              <span className="font-semibold text-ink">{r.symbol}</span>
              <span className="text-right text-ink">
                {r.close !== null
                  ? `${r.currency ?? ""} ${r.close.toFixed(2)}`
                  : <span className="text-dim">—</span>}
              </span>
              <span className="text-right text-muted hidden sm:inline col-span-2 sm:col-span-1">
                {r.quoteDate
                  ? <>{r.quoteDate} · <span className="text-dim">{r.lastUpdated ? dtFmt.format(r.lastUpdated) : "—"}</span></>
                  : <span className="text-dim">never priced</span>}
              </span>
              <span className={`text-right inline-flex items-center gap-1.5 justify-end ${textColor}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                {level === "missing" ? "missing" : level}
              </span>
              {/* Mobile-only secondary line — show quote date + sync under the row. */}
              <span className="text-right text-muted sm:hidden col-span-2 text-[11px]">
                {r.quoteDate
                  ? <>{r.quoteDate} · {r.lastUpdated ? dtFmt.format(r.lastUpdated) : "—"} UTC</>
                  : <span className="text-dim">never priced</span>}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 font-mono text-[10px] text-dim leading-relaxed">
        Cron refreshes the 8 oldest-cached symbols every hour during the US
        market window (13:30–22:30 UTC weekdays). Symbols that stay amber/red
        for &gt;24h are usually paywalled on the free providers — send the
        ticker my way and we&apos;ll add a manual override.
      </div>
    </Card>
  );
}
