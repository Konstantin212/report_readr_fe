"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * The subset of `instrument_meta` the detail panel's data-source card
 * renders. Built server-side in `getPositionsData` (SelectedPosition.meta)
 * and threaded through DetailData. Kept structurally identical to the
 * classification store's OK-row fields so no mapping is needed downstream.
 */
export type InstrumentMetaView = {
  source: string | null;
  assetKind: "stock" | "etf" | "bond" | "other" | null;
  sector: string | null;
  industry: string | null;
  distribution: { policy: "DISTRIBUTING" | "ACCUMULATING"; frequency: string | null } | null;
  terPct?: string | null;
  teilfreistellungPct?: number | null;
};

/** Human labels for the provider that authoritatively owns the metadata. */
const SOURCE_LABEL: Record<string, string> = {
  JUSTETF: "justETF",
  YAHOO: "Yahoo Finance",
  FMP: "Financial Modeling Prep",
  MANUAL: "Manual link",
};

const ASSET_LABEL: Record<string, string> = {
  stock: "Stock",
  etf: "ETF",
  bond: "Bond",
  other: "Other",
};

/**
 * "Where this instrument's classification came from" card, shown in the
 * position detail panel. Two states:
 *  - meta present  → source badge + asset kind + sector/industry, and for
 *    ETFs the distribution policy, TER, and Teilfreistellung.
 *  - meta absent   → a manual-link input so the user can pin the
 *    instrument to a Yahoo/justETF/Google/Stockopedia listing. The POST
 *    re-runs enrichment; on success the server data refreshes and this
 *    card re-renders in its populated state.
 */
export function InstrumentSourceCard({
  isin,
  symbol,
  currency,
  meta,
}: {
  isin: string | null;
  symbol: string;
  currency: string | null;
  meta: InstrumentMetaView | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/instruments/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, isin, url: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status}).`);
      }
      if (data?.status === "OK") {
        // Server data now carries the populated meta — refresh so this
        // card re-renders in its populated state. Keep the spinner up
        // (don't clear `submitting`): the refresh unmounts this form.
        router.refresh();
        return;
      }
      // Enrichment ran but no provider authoritatively owned the
      // instrument (NOT_FOUND) or hit a transient error.
      setError(
        data?.status === "NOT_FOUND"
          ? "No provider recognised this instrument. Try a link from a different site."
          : (data?.lastError ?? "Could not fetch data for that link. Try again."),
      );
      setSubmitting(false);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const linkForm = (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={submitting}
        placeholder="Paste a Yahoo, justETF, Google Finance or Stockopedia link"
        className="w-full bg-panel border border-border rounded-md px-2.5 py-1.5 text-[12px] text-ink placeholder:text-dim focus:outline-none focus:border-mint/50 disabled:opacity-60"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || !url.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-mint/15 text-mint border border-mint/30 font-mono text-[11px] tracking-wider hover:bg-mint/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {submitting ? "Fetching data…" : error ? "Retry" : "Link data source"}
        </button>
        {submitting && <span className="font-mono text-[10px] text-dim">Contacting provider…</span>}
      </div>
      {error && !submitting && (
        <div className="font-mono text-[11px] text-bad leading-relaxed">{error}</div>
      )}
    </form>
  );

  if (meta) {
    const isEtf = meta.assetKind === "etf";
    const sourceLabel = meta.source ? (SOURCE_LABEL[meta.source] ?? meta.source) : "Unknown";
    const dist = meta.distribution;
    return (
      <div className="bg-panel2 rounded-[14px] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-dim uppercase tracking-widest">Data source</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowForm((v) => !v); setError(null); }}
              className="font-mono text-[10px] text-dim hover:text-ink tracking-wider"
            >
              {showForm ? "Cancel" : "Change"}
            </button>
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded bg-mint/10 text-mint border border-mint/25 font-mono text-[10px] tracking-wider"
              title={isin ? `ISIN ${isin}` : undefined}
            >
              {sourceLabel}
            </span>
          </div>
        </div>
        {showForm && (
          <div className="pt-1">
            <div className="text-[11px] text-muted mb-1.5">
              Replace the pinned listing — paste a new link (e.g. Google Finance for an LSE stock).
            </div>
            {linkForm}
          </div>
        )}
        <div className="flex items-baseline gap-2 flex-wrap">
          {meta.assetKind && (
            <span className="px-1.5 py-0.5 rounded bg-panel text-ink font-mono text-[10px] tracking-wider">
              {ASSET_LABEL[meta.assetKind]}
            </span>
          )}
          {dist && (
            <span
              title={
                dist.policy === "DISTRIBUTING"
                  ? `Distributing${dist.frequency ? ` · ${dist.frequency}` : ""}`
                  : "Accumulating — Vorabpauschale applies (§18 InvStG)"
              }
              className={`px-1.5 py-0.5 rounded font-mono text-[10px] tracking-wider ${
                dist.policy === "DISTRIBUTING" ? "bg-mint/10 text-mint" : "bg-amber/10 text-amber"
              }`}
            >
              {dist.policy === "DISTRIBUTING"
                ? `Dist${dist.frequency ? ` · ${dist.frequency}` : ""}`
                : "Acc"}
            </span>
          )}
        </div>
        {(meta.sector || meta.industry) && (
          <div className="font-mono text-[11px] text-muted">
            {[meta.sector, meta.industry].filter(Boolean).join(" · ")}
          </div>
        )}
        {isEtf && (meta.terPct != null || meta.teilfreistellungPct != null) && (
          <div className="flex gap-4 pt-1">
            {meta.terPct != null && (
              <div>
                <div className="font-mono text-[9px] text-dim uppercase tracking-widest">TER</div>
                <div className="font-mono text-[12px] text-ink mt-0.5">{Number(meta.terPct).toFixed(2)}%</div>
              </div>
            )}
            {meta.teilfreistellungPct != null && (
              <div>
                <div
                  className="font-mono text-[9px] text-dim uppercase tracking-widest cursor-help"
                  title="Partial exemption of gains/distributions from tax under §20 InvStG (Teilfreistellung)."
                >
                  Teilfreistellung
                </div>
                <div className="font-mono text-[12px] text-ink mt-0.5">{meta.teilfreistellungPct}%</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // No metadata yet — offer the manual-link input.
  return (
    <div className="bg-panel2 rounded-[14px] p-3 space-y-2">
      <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Data source</div>
      <div className="text-[12px] text-muted leading-relaxed">
        No market data resolved for {symbol}
        {currency ? ` (${currency})` : ""}. Paste a link to pin its listing.
      </div>
      {linkForm}
    </div>
  );
}
