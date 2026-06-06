"use client";
import { useEffect, useRef } from "react";
import { Card } from "./card";
import { Sparkline } from "./sparkline";
import { usePnlMode } from "./pnl-mode";
import { classifyQuoteFreshness } from "@/lib/quotes/freshness";

export type Lot = {
  openedAt: string;
  qty: string;
  costEur: string;
  pricePerUnitEur: string;
  pctOfTotal: number;
  gainPct: number | null;
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
  // Mode-specific cost / P/L per the active toggle.
  views: {
    broker: { unrealizedEur: number; unrealizedPct: number | null; avgCostEur: number };
    net:    { unrealizedEur: number; unrealizedPct: number | null; avgCostEur: number };
  };
  sparkline: number[];
  sparkPctChange?: number | null;
  lots: Lot[];
  dividendsYtdEur: number;
  /** Total dividends received on this position, EUR, after WHT. */
  dividendsTotalEur: number;
  /** Total broker commissions baked into the cost basis, EUR. */
  feesEur: number;
  yieldOnCostPct: number;
  daysHeld: number;
  /** ISO date of the cached spot price (latest entry in quote_cache) —
   *  null if we never priced this symbol. Surfaced as a small "as of …"
   *  chip below the value; turns amber/red when the quote falls behind
   *  so silent cron failures are visible in the UI instead of just
   *  skewing the P/L number. */
  priceAsOf?: string | null;
};

export function PositionDetailPanel({ d }: { d: DetailData }) {
  const { mode } = usePnlMode();
  const v = d.views[mode];
  const fmtEur = (v: number, dec = 2) => `€${Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
  const palette = ["var(--accent-mint, #7CFFB2)", "var(--accent-amber, #FFD24A)", "var(--accent-pink, #FF5DA2)"];

  // On mobile the panel renders at the bottom of /positions, hidden far
  // below the stocks/ETFs/cash/crypto sections — users tap a row and
  // think nothing happened. Scroll the panel into view on selection
  // change. Desktop renders the panel as a side column at lg:, where
  // scroll-into-view is a no-op (panel is already visible).
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
    if (!isMobile) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [d.symbol]);

  return (
    <Card ref={ref} className="scroll-mt-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-14 h-14 rounded-[14px] bg-mint/20 text-mint font-mono font-bold text-[16px] flex items-center justify-center">{d.symbol.slice(0,3)}</div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <div className="font-bold text-[22px] tracking-tight">{d.symbol}</div>
            <div className="px-2 py-0.5 rounded-full bg-panel2 font-mono text-[10px] text-muted tracking-wider">
              {d.broker} · {d.currency} · {d.sector}
            </div>
          </div>
          {d.name && <div className="font-medium text-[13px] text-muted mt-0.5">{d.name}</div>}
        </div>
        <button className="border border-borderHard text-ink px-3 py-1.5 rounded-md font-mono text-[11px] uppercase tracking-widest opacity-50 cursor-not-allowed">＋ Add lot</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Position value</div>
          <div className="font-bold text-[28px] num mt-1 tracking-tight">{fmtEur(d.marketEur)}</div>
          <div className="font-mono text-[11px] text-muted mt-1">{d.qty} × {fmtEur(d.pricePerUnitEur, 2)}</div>
          {d.priceAsOf !== undefined && <QuoteFreshnessChip asOf={d.priceAsOf} />}
        </div>
        <div>
          <div className="font-mono text-[10px] text-dim uppercase tracking-widest flex items-center gap-1.5">
            Unrealized P/L
            <span className="px-1 py-0.5 rounded bg-panel2 text-mint normal-case tracking-normal text-[9px]">{mode}</span>
          </div>
          <div className={`font-bold text-[28px] num mt-1 tracking-tight ${v.unrealizedEur >= 0 ? "text-mint" : "text-bad"}`}>
            {(v.unrealizedEur >= 0 ? "+" : "−") + fmtEur(v.unrealizedEur)}
          </div>
          <div className="font-mono text-[11px] text-muted mt-1">
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

      <div className="bg-panel2 rounded-[14px] p-3 mb-4">
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

      <div className="mb-4">
        <div className="font-semibold text-[13px] mb-2">Cost basis · FIFO lots</div>
        {d.lots.length === 0 && <div className="text-muted text-sm">No lots data.</div>}
        {d.lots.map((l, i) => {
          const color = palette[i % palette.length];
          return (
            <div
              key={i}
              className="mb-2 p-2 rounded-md bg-panel2/40 lg:bg-transparent lg:p-0 lg:rounded-none"
            >
              {/* Mobile: stack opened / qty@price on first line, gain on its own line right-aligned.
                  Desktop (lg): keep the original single-line flex row. */}
              <div className="flex flex-col gap-1 lg:flex-row lg:justify-between lg:items-baseline lg:gap-2 font-mono text-[11px] mb-1 lg:mb-0.5">
                <div className="flex justify-between items-baseline gap-2 lg:contents">
                  <span className="text-muted">{l.openedAt}</span>
                  <span className="text-ink">{l.qty} sh @ €{l.pricePerUnitEur}</span>
                </div>
                {l.gainPct !== null && (
                  <span className={`font-semibold text-right lg:text-left ${l.gainPct >= 0 ? "text-mint" : "text-bad"}`}>
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

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-panel2 rounded-md p-2.5">
          <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Dividends YTD</div>
          <div className="font-bold text-[16px] num text-amber mt-0.5">€{d.dividendsYtdEur.toFixed(0)}</div>
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
    </Card>
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
