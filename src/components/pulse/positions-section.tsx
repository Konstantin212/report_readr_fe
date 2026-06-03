"use client";
import Link from "next/link";
import { Card } from "./card";
import { usePnlMode, PnlModeToggle } from "./pnl-mode";

type ViewMetrics = {
  avgCostEur: number;
  costEur: number;
  plEur: number | null;
  plPct: number | null;
  avgCostNative: number | null;
  costNative: number | null;
  plNative: number | null;
};

type Row = {
  symbol: string;
  name?: string;
  broker: string;
  currency: string;
  sector: string;
  qty: number;
  pricePerUnitEur: number | null;
  marketEur: number | null;
  nativeCurrency: string | null;
  views: { broker: ViewMetrics; net: ViewMetrics };
};

const CCY_SYMBOL: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CHF: "₣", JPY: "¥", SEK: "kr", HKD: "HK$", CAD: "C$",
};

/**
 * Avatar label for the position row's circle. For tickers with 2+
 * characters, use the first two letters. For single-letter tickers like
 * `C` (Citigroup) or `O` (Realty Income), the avatar would duplicate
 * the ticker — derive the initials from the company name instead so the
 * circle adds information rather than repeats it.
 */
function avatarLabel(symbol: string, name?: string): string {
  if (symbol.length >= 2) return symbol.slice(0, 2);
  if (name) {
    const parts = name.replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  }
  return symbol;
}

// Broker-level color cue. Green for Freedom, red for IBKR — applied as
// a pill on the broker label and a 2 px left-border tint on the row when
// the row is not currently selected (selection uses solid mint, which
// takes precedence so the selected state still pops).
function brokerStyle(broker: string): { chip: string; borderLeft: string } {
  const norm = broker.toUpperCase();
  if (norm === "FF" || norm.startsWith("FREEDOM")) {
    return {
      chip: "bg-mint/15 text-mint border border-mint/30",
      borderLeft: "border-l-mint/40",
    };
  }
  if (norm === "IBKR") {
    return {
      chip: "bg-bad/15 text-bad border border-bad/30",
      borderLeft: "border-l-bad/40",
    };
  }
  return { chip: "bg-panel2 text-muted", borderLeft: "border-l-transparent" };
}

export function PositionsSection({
  title,
  count,
  rows,
  basePath,
  preservedQuery,
  selectedSymbol,
  showToggle = false,
}: {
  title: string;
  count: number;
  rows: Row[];
  /** URL path for the link target on each row (e.g. "/positions"). */
  basePath: string;
  /** Query params to preserve when navigating between rows
   *  (broker filter, sector filter, …). The component appends `symbol`. */
  preservedQuery: Record<string, string>;
  selectedSymbol?: string | null;
  /** Render the Broker/Net toggle in the section header. Show on the first
   *  section only so the page doesn't repeat the same control. */
  showToggle?: boolean;
}) {
  const hrefFor = (symbol: string) => {
    const usp = new URLSearchParams(preservedQuery);
    usp.set("symbol", symbol);
    const s = usp.toString();
    return `${basePath}${s ? `?${s}` : ""}`;
  };
  const { mode } = usePnlMode();
  if (rows.length === 0) return null;
  const fmtEur = (v: number) => "€" + Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (v: number | null) => v === null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  const fmtNative = (v: number | null, ccy: string | null) => {
    if (v === null || !ccy) return "—";
    const sym = CCY_SYMBOL[ccy] ?? "";
    const num = Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return sym ? `${sym}${num}` : `${num} ${ccy}`;
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex justify-between items-center px-5 py-3 border-b border-border">
        <div className="font-semibold text-sm">{title}</div>
        <div className="flex items-center gap-3">
          {showToggle && <PnlModeToggle />}
          <div className="font-mono text-[11px] text-muted tracking-wider">{count} holdings</div>
        </div>
      </div>
      <div className="hidden lg:grid grid-cols-[1.5fr_0.55fr_0.5fr_0.65fr_0.65fr_0.75fr_0.85fr_0.85fr_0.85fr_0.55fr] gap-0 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
        <span>Holding</span>
        <span>Broker</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Avg €</span>
        <span className="text-right">Price €</span>
        <span className="text-right">Cost €</span>
        <span className="text-right">Value €</span>
        <span className="text-right">P/L €</span>
        <span className="text-right">P/L ccy</span>
        <span className="text-right">%</span>
      </div>
      {rows.map(r => {
        const isSelected = r.symbol === selectedSymbol;
        const bk = brokerStyle(r.broker);
        const v = r.views[mode];
        const plEurColor = v.plEur === null ? "text-muted" : v.plEur >= 0 ? "text-mint" : "text-bad";
        const plNativeColor = v.plNative === null ? "text-muted" : v.plNative >= 0 ? "text-mint" : "text-bad";
        const plPctColor = v.plPct === null ? "text-muted" : v.plPct >= 0 ? "text-mint" : "text-bad";
        return (
          <Link
            key={r.symbol}
            href={hrefFor(r.symbol) as never}
            className={`flex flex-col gap-2 px-4 py-3 min-h-[68px] cursor-pointer hover:bg-panel2/50 border-l-2 lg:grid lg:grid-cols-[1.5fr_0.55fr_0.5fr_0.65fr_0.65fr_0.75fr_0.85fr_0.85fr_0.85fr_0.55fr] lg:gap-0 lg:px-5 lg:py-3 lg:items-center ${
              isSelected ? "bg-panel2 border-l-mint" : bk.borderLeft
            } border-b border-border last:border-b-0`}
          >
            {/* Line 1: avatar + symbol + name. On lg, this is column 1 of the grid. */}
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                isSelected ? "bg-mint/20 text-mint" : "bg-panel2 text-muted"
              }`}>{avatarLabel(r.symbol, r.name)}</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[13px]">
                  {r.symbol}{" "}
                  <span className="font-mono text-[10px] text-dim ml-1">{r.sector} · {r.currency}</span>
                  <span className="lg:hidden font-mono text-[10px] text-dim ml-1">
                    · avg {v.avgCostEur.toFixed(2)} · {r.pricePerUnitEur === null ? "—" : r.pricePerUnitEur.toFixed(2)}
                  </span>
                </div>
                {r.name && <div className="text-[11px] text-muted truncate">{r.name}</div>}
              </div>
            </div>

            {/* Line 2 (mobile only): broker pill · qty · value €.
                On lg, the broker pill / qty / avg / price / value cells render directly as grid cells. */}
            <div className="flex items-center justify-between gap-3 lg:hidden">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] tracking-wider w-fit ${bk.chip}`}>{r.broker}</span>
                <span className="font-mono text-[11px] text-muted">{r.qty} sh</span>
              </div>
              <span className="font-mono font-semibold text-[13px] text-right shrink-0">
                {r.marketEur === null ? "—" : fmtEur(r.marketEur)}
              </span>
            </div>

            {/* Line 3 (mobile only): P/L €, P/L ccy, %. */}
            <div className="flex items-center justify-between gap-3 lg:hidden font-mono text-xs">
              <span className={`font-semibold ${plEurColor}`}>
                {v.plEur === null ? "—" : (v.plEur >= 0 ? "+" : "−") + fmtEur(v.plEur)}
              </span>
              <span className={`font-semibold ${plNativeColor}`}>
                {v.plNative === null ? "—" : (v.plNative >= 0 ? "+" : "−") + fmtNative(v.plNative, r.nativeCurrency)}
              </span>
              <span className={`font-semibold ${plPctColor}`}>
                {fmtPct(v.plPct)}
              </span>
            </div>

            {/* Desktop-only grid cells (cols 2-9). Hidden on mobile because lines 2/3 above already
                surface this data in a stacked form. */}
            <span className={`hidden lg:inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] tracking-wider w-fit ${bk.chip}`}>{r.broker}</span>
            <span className="hidden lg:block text-right font-mono text-xs text-muted">{r.qty}</span>
            <span className="hidden lg:block text-right font-mono text-xs text-muted">{v.avgCostEur.toFixed(2)}</span>
            <span className="hidden lg:block text-right font-mono text-xs">{r.pricePerUnitEur === null ? "—" : r.pricePerUnitEur.toFixed(2)}</span>
            {/* Cost basis €. Uses the user's selected view (broker excludes
                commissions, net includes them). This is the actual
                Anschaffungskosten figure that maps to Anlage KAP. */}
            <span className="hidden lg:block text-right font-mono text-xs text-muted">{fmtEur(v.costEur)}</span>
            <span className="hidden lg:block text-right font-mono font-semibold text-xs">{r.marketEur === null ? "—" : fmtEur(r.marketEur)}</span>
            <span className={`hidden lg:block text-right font-mono font-semibold text-xs ${plEurColor}`}>
              {v.plEur === null ? "—" : (v.plEur >= 0 ? "+" : "−") + fmtEur(v.plEur)}
            </span>
            <span className={`hidden lg:block text-right font-mono font-semibold text-xs ${plNativeColor}`}>
              {v.plNative === null ? "—" : (v.plNative >= 0 ? "+" : "−") + fmtNative(v.plNative, r.nativeCurrency)}
            </span>
            <span className={`hidden lg:block text-right font-mono font-semibold text-xs ${plPctColor}`}>
              {fmtPct(v.plPct)}
            </span>
          </Link>
        );
      })}
    </Card>
  );
}
