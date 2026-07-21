"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { Sparkline } from "./sparkline";
import { usePnlMode } from "./pnl-mode";
import { InstrumentSourceCard, type InstrumentMetaView } from "./instrument-source-card";
import { classifyQuoteFreshness } from "@/lib/quotes/freshness";

export type Lot = {
  openedAt: string;
  qty: string;
  costEur: string;
  pricePerUnitEur: string;
  pctOfTotal: number;
  gainPct: number | null;
};

export type DetailTransaction = {
  date: string;
  side: "buy" | "sell";
  qty: number;
  priceNative: number | null;
  currency: string;
  amountNative: number;
  amountEur: number;
  feeNative: number | null;
};

export type DetailData = {
  symbol: string;
  name?: string;
  broker: string;
  sector: string;
  currency: string;
  marketEur: number;
  qty: number;
  pricePerUnitEur: number;
  views: {
    broker: { unrealizedEur: number; unrealizedPct: number | null; avgCostEur: number };
    net:    { unrealizedEur: number; unrealizedPct: number | null; avgCostEur: number };
  };
  sparkline: number[];
  sparkPctChange?: number | null;
  lots: Lot[];
  dividendsYtdEur: number;
  /** Lifetime net dividends on this position (post-WHT, EUR). */
  dividendsTotalEur: number;
  /** Number of dividend payments contributing to dividendsTotalEur. */
  dividendsTotalCount: number;
  /** Total broker commissions baked into the cost basis, EUR. */
  feesEur: number;
  yieldOnCostPct: number;
  daysHeld: number;
  priceAsOf?: string | null;
  /** Every TRADE event for this symbol — buy and sell — ordered oldest first. */
  transactions: DetailTransaction[];
  /** ISIN of the selected instrument (null when unknown). Passed to the
   *  data-source card so a manual link can be keyed to it. */
  isin: string | null;
  /** Market-data metadata for the "data source" card, or null when no OK
   *  classification exists yet (card then offers the manual-link input). */
  meta: InstrumentMetaView | null;
};

/**
 * Right-side overlay (≥ lg) / bottom sheet (< lg). Fixed-position so it
 * never squeezes the positions list. Close via the X button, the
 * backdrop, or ESC.
 */
export function PositionDetailPanel({ d, onClose }: { d: DetailData; onClose: () => void }) {
  const { mode } = usePnlMode();
  const v = d.views[mode];
  const fmtEur = (v: number, dec = 2) =>
    `€${Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
  const fmtNative = (v: number, ccy: string, dec = 2) => {
    const sign = v < 0 ? "−" : "";
    return `${sign}${Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${ccy}`;
  };
  const palette = ["var(--accent-mint, #7CFFB2)", "var(--accent-amber, #FFD24A)", "var(--accent-pink, #FF5DA2)"];

  const close = onClose;

  // ESC closes. Listening at the document level so the panel doesn't
  // need focus to react.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop. Click anywhere outside the panel to close. */}
      <div
        className="fixed inset-0 z-40 bg-bg/60 backdrop-blur-[2px]"
        onClick={close}
        aria-hidden="true"
      />
      {/* Sliding overlay. On <lg it covers the full screen (bottom-sheet
          feel), at lg+ it's anchored to the right at ~470px wide. */}
      <aside
        className="fixed z-50 right-0 top-0 h-[100dvh] w-full lg:w-[470px] overflow-y-auto overscroll-contain bg-panel border-l border-border shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="position-detail-symbol"
      >
        <div className="pt-[26px] px-[22px] lg:px-[28px] pb-[60px]">
          {/* Header: avatar + symbol + broker/ccy/sector meta + close. */}
          <div className="flex items-start gap-3">
            <div className="w-[52px] h-[52px] rounded-[15px] bg-mint/20 text-mint font-mono font-bold text-[16px] flex items-center justify-center shrink-0">
              {d.symbol.slice(0, 3)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <div id="position-detail-symbol" className="font-bold text-[23px] tracking-tight">{d.symbol}</div>
                <div className="px-2 py-0.5 rounded-full bg-panel2 font-mono text-[11px] text-muted tracking-wider">
                  {d.broker} · {d.currency} · {d.sector}
                </div>
              </div>
              {d.name && <div className="font-medium text-[13px] text-muted mt-0.5 truncate">{d.name}</div>}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="rounded-md w-9 h-9 flex items-center justify-center text-muted hover:text-ink hover:bg-panel2 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Two-up: position value | unrealized P/L. */}
          <div className="grid grid-cols-2 gap-[18px] mt-[26px]">
            <div>
              <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Position value</div>
              <div className="font-bold text-[30px] num mt-1 tracking-tight">{fmtEur(d.marketEur)}</div>
              <div className="font-mono text-[12px] text-muted mt-1">{d.qty} × {fmtEur(d.pricePerUnitEur, 2)}</div>
              {d.priceAsOf !== undefined && <QuoteFreshnessChip asOf={d.priceAsOf} />}
            </div>
            <div>
              <div className="font-mono text-[10px] text-dim uppercase tracking-widest flex items-center gap-1.5">
                Unrealized P/L
                <span className="px-1 py-0.5 rounded bg-panel2 text-mint normal-case tracking-normal text-[9px]">{mode}</span>
              </div>
              <div className={`font-bold text-[30px] num mt-1 tracking-tight ${v.unrealizedEur >= 0 ? "text-mint" : "text-bad"}`}>
                {(v.unrealizedEur >= 0 ? "+" : "−") + fmtEur(v.unrealizedEur)}
              </div>
              <div className="font-mono text-[12px] text-muted mt-1">
                {v.unrealizedPct === null ? "—" : (v.unrealizedPct >= 0 ? "+" : "") + v.unrealizedPct.toFixed(1) + "%"} from {fmtEur(v.avgCostEur, 2)}
              </div>
              {(d.feesEur > 0 || d.dividendsTotalEur > 0) && (
                <div className="font-mono text-[10px] text-dim mt-2 leading-relaxed">
                  {d.feesEur > 0 && <>fees in cost basis: {fmtEur(d.feesEur)}<br/></>}
                  {d.dividendsTotalEur > 0 && <>dividends received (net): {fmtEur(d.dividendsTotalEur)}</>}
                </div>
              )}
            </div>
          </div>

          {/* Sparkline. */}
          <div className="bg-panel2 rounded-[16px] pt-4 pb-4 pl-[18px] pr-[18px] mt-5">
            <div className="flex justify-between items-baseline mb-1">
              <span className="font-mono text-[10px] text-dim uppercase tracking-widest">Price · history</span>
              {d.sparkPctChange !== null && d.sparkPctChange !== undefined && (
                <span className={`font-mono text-[11px] font-semibold ${d.sparkPctChange >= 0 ? "text-mint" : "text-bad"}`}>
                  {(d.sparkPctChange >= 0 ? "+" : "") + d.sparkPctChange.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="h-[70px]"><Sparkline values={d.sparkline} /></div>
          </div>

          {/* Quantity · avg cost · current price · cost basis tiles.
              Cost basis is derived as qty × avgCostEur (mode-specific) —
              mathematically identical to the loader's authoritative
              costEur (avgCostEur is defined as costEur / qty — see
              buildEurView in lib/data/positions.ts), so this isn't new
              data, just the product of two values DetailData already
              carries. */}
          <div className="grid grid-cols-2 gap-[10px] mt-4">
            <div className="bg-panel2 rounded-[12px] pt-[14px] pb-[14px] px-4">
              <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Quantity</div>
              <div className="font-semibold text-[16px] num mt-0.5">{d.qty}</div>
            </div>
            <div className="bg-panel2 rounded-[12px] pt-[14px] pb-[14px] px-4">
              <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Avg cost</div>
              <div className="font-semibold text-[16px] num mt-0.5">{fmtEur(v.avgCostEur, 2)}</div>
            </div>
            <div className="bg-panel2 rounded-[12px] pt-[14px] pb-[14px] px-4">
              <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Current price</div>
              <div className="font-semibold text-[16px] num mt-0.5">{fmtEur(d.pricePerUnitEur, 2)}</div>
            </div>
            <div className="bg-panel2 rounded-[12px] pt-[14px] pb-[14px] px-4">
              <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Cost basis</div>
              <div className="font-semibold text-[16px] num mt-0.5">{fmtEur(d.qty * v.avgCostEur, 2)}</div>
            </div>
          </div>

          {/* Dividend / holding-period tiles. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            <div className="bg-panel2 rounded-md p-2.5">
              <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Dividends YTD</div>
              <div className="font-bold text-[16px] num text-amber mt-0.5">€{d.dividendsYtdEur.toFixed(0)}</div>
            </div>
            <div className="bg-panel2 rounded-md p-2.5">
              <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Div received</div>
              <div className="font-bold text-[16px] num text-amber mt-0.5">€{d.dividendsTotalEur.toFixed(0)}</div>
              <div className="font-mono text-[10px] text-dim mt-0.5">
                {d.dividendsTotalCount} payment{d.dividendsTotalCount === 1 ? "" : "s"}
              </div>
            </div>
            <div className="bg-panel2 rounded-md p-2.5">
              <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Yield on cost</div>
              <div className="font-bold text-[16px] num mt-0.5">{d.yieldOnCostPct.toFixed(1)}%</div>
            </div>
            <div className="bg-panel2 rounded-md p-2.5">
              <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Days held</div>
              <div className="font-bold text-[16px] num mt-0.5">{d.daysHeld}</div>
            </div>
          </div>

          {/* Transaction ledger — every buy/sell for this ticker. Lets the
              user audit how the FIFO lots below were built. */}
          <div className="mt-5">
            <div className="flex items-baseline justify-between mb-2">
              <div className="font-semibold text-[13px]">Transactions</div>
              <div className="font-mono text-[10px] text-muted">{d.transactions.length}</div>
            </div>
            {d.transactions.length === 0 && (
              <div className="text-muted text-sm">No trades recorded for this symbol.</div>
            )}
            <div className="space-y-1">
              {d.transactions.map((t, i) => (
                <div key={i} className="flex items-baseline gap-2 px-2 py-1.5 rounded-md bg-panel2/40 font-mono text-[11px]">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider ${
                    t.side === "buy" ? "bg-mint/15 text-mint" : "bg-bad/15 text-bad"
                  }`}>
                    {t.side === "buy" ? "BUY" : "SELL"}
                  </span>
                  <span className="text-muted">{t.date}</span>
                  <span className="ml-auto text-ink">
                    {t.qty.toLocaleString("de-DE", { maximumFractionDigits: 4 })} sh
                    {t.priceNative !== null && <> @ {fmtNative(t.priceNative, t.currency, 4)}</>}
                  </span>
                  <span className={`shrink-0 ${t.side === "buy" ? "text-bad" : "text-mint"}`}>
                    {t.side === "buy" ? "−" : "+"}{fmtNative(Math.abs(t.amountNative), t.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Appended below the mockup's content: FIFO lots + the
              data-source card — richer app features the mockup omits,
              kept per Task 5's instructions. */}
          <div className="mt-5">
            <div className="font-semibold text-[13px] mb-2">Cost basis · FIFO lots</div>
            {d.lots.length === 0 && <div className="text-muted text-sm">No lots data.</div>}
            {d.lots.map((l, i) => {
              const color = palette[i % palette.length];
              return (
                <div key={i} className="mb-2 p-2 rounded-md bg-panel2/40">
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-baseline sm:gap-2 font-mono text-[11px] mb-1 sm:mb-0.5">
                    <div className="flex justify-between items-baseline gap-2 sm:contents">
                      <span className="text-muted">{l.openedAt}</span>
                      <span className="text-ink">{l.qty} sh @ €{l.pricePerUnitEur}</span>
                    </div>
                    {l.gainPct !== null && (
                      <span className={`font-semibold text-right sm:text-left ${l.gainPct >= 0 ? "text-mint" : "text-bad"}`}>
                        {(l.gainPct >= 0 ? "+" : "") + l.gainPct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div className="h-1 bg-white/5 rounded-full">
                    <div className="h-full rounded-full" style={{ width: `${l.pctOfTotal}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5">
            <InstrumentSourceCard isin={d.isin} symbol={d.symbol} currency={d.currency} meta={d.meta} />
          </div>
        </div>
      </aside>
    </>
  );
}

/** "as of YYYY-MM-DD" chip under the position value. Colour cue when
 *  the cached spot price has fallen behind — so a broken quote cron
 *  shows up in the UI instead of silently skewing P/L. */
function QuoteFreshnessChip({ asOf }: { asOf: string | null | undefined }) {
  if (!asOf) {
    return (
      <div className="font-mono text-[10px] text-dim mt-1.5 inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-dim" /> no recent quote
      </div>
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const level = classifyQuoteFreshness(asOf, today);
  const cls = level === "stale" ? "text-bad" : level === "ok" ? "text-amber" : "text-dim";
  const dot = level === "stale" ? "bg-bad" : level === "ok" ? "bg-amber" : "bg-mint";
  return (
    <div className={`font-mono text-[10px] mt-1.5 inline-flex items-center gap-1 ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      as of {asOf}{level === "stale" && " · stale"}
    </div>
  );
}
