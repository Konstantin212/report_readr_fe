"use client";
import { Card } from "./card";
import { usePnlMode, PnlModeToggle } from "./pnl-mode";
import { classifyQuoteFreshness } from "@/lib/quotes/freshness";

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
  /** ISO YYYY-MM-DD — price date of the quote backing this row, or null. */
  asOf?: string | null;
  /** Provider label written into quote_cache.source. Null when no quote
   *  exists at all. */
  quoteSource?: string | null;
  /** ISO timestamp of when the cache row was written. Server-rendered Dates
   *  cross the boundary as strings. */
  quoteUpdatedAt?: string | null;
  /** Fund distribution policy — set only for ETFs whose metadata resolved
   *  OK. Drives the Dist/Acc chip in the row subtitle. */
  distribution?: { policy: "DISTRIBUTING" | "ACCUMULATING"; frequency: string | null } | null;
  /** Prior tickers before a rename (e.g. ["SKHYV"] after SKHYV → SKHY).
   *  Drives the "was …" provenance chip. Empty/absent when never renamed. */
  formerTickers?: string[];
};

/**
 * Single source of truth for the per-row data-source chip. Each new
 * provider added to the quote orchestrator only touches THIS record —
 * the short label, long label, and visual kind all flow from here.
 */
type SourceKind = "api" | "statement";
const SOURCE_META: Record<string, { short: string; long: string; kind: SourceKind }> = {
  FREEDOM_SNAPSHOT: { short: "FF",  long: "Freedom statement snapshot",     kind: "statement" },
  IBKR_SNAPSHOT:    { short: "IB",  long: "IBKR statement snapshot",        kind: "statement" },
  FMP:              { short: "FMP", long: "Financial Modeling Prep API",    kind: "api" },
  TWELVE_DATA:      { short: "12D", long: "Twelve Data API",                kind: "api" },
  YAHOO:            { short: "YAH", long: "Yahoo Finance API",              kind: "api" },
  JUSTETF:          { short: "JETF", long: "justETF EOD",                   kind: "api" },
  STOOQ:            { short: "STQ", long: "Stooq CSV API",                  kind: "api" },
  COINGECKO:        { short: "CG",  long: "CoinGecko API",                  kind: "api" },
};

function sourceMeta(src: string | null | undefined) {
  if (!src) return null;
  return SOURCE_META[src] ?? null;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "?";
  const days = (Date.now() - then) / 86_400_000;
  if (days < 1) return "today";
  if (days < 2) return "1 day ago";
  if (days < 30) return `${Math.round(days)} days ago`;
  if (days < 365) return `${Math.round(days / 30)} mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

/**
 * Defensive YYYY-MM-DD extraction for the inline date chip. Schema says
 * quote_cache.date is always YYYY-MM-DD, but if a provider ever writes a
 * full ISO timestamp by mistake, plain `.slice(5)` would produce garbled
 * text like "-06-01T00:00:00.000Z" in the chip.
 */
function monthDay(asOf: string): string {
  return asOf.slice(0, 10).slice(5);
}

/**
 * Per-row "where this price came from" chip. Sits in the column right of
 * Broker. Snapshot sources (≡, amber tint) show the price date inline;
 * API sources (·, muted tint) keep it in the tooltip. When the row is
 * stale, the date renders in amber too so it stands out at a glance.
 */
function QuoteSourceIndicator({
  source,
  asOf,
  updatedAt,
  stale,
}: {
  source: string | null | undefined;
  asOf: string | null | undefined;
  updatedAt: string | null | undefined;
  stale: boolean;
}) {
  const meta = sourceMeta(source);
  const isStatement = meta?.kind === "statement";
  const isApi = meta?.kind === "api";
  const glyph = isStatement ? "≡" : isApi ? "·" : "?";
  const baseChip = isStatement
    ? "bg-amber/10 text-amber border border-amber/25"
    : isApi
    ? "bg-panel2 text-muted border border-border"
    : "bg-panel2 text-dim border border-border";
  const tooltip = [
    meta?.long ?? (source ?? "Unknown source"),
    asOf ? `price date ${asOf}` : null,
    updatedAt ? `cached ${relativeTime(updatedAt)}` : null,
    stale ? "stale" : null,
  ].filter(Boolean).join(" · ");
  const shortLabel = meta?.short ?? (source ? source.slice(0, 3) : "?");

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded font-mono text-[9px] tracking-wider w-fit cursor-help ${baseChip}`}
    >
      <span>{glyph}</span>
      <span>{shortLabel}</span>
      {asOf && (isStatement || stale) && (
        <span className={`ml-0.5 ${stale ? "text-amber" : "opacity-70"}`}>{monthDay(asOf)}</span>
      )}
    </span>
  );
}

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

// Broker-level color cue. Uses each broker's actual brand color rather
// than the semantic `mint` / `bad` tokens — `mint` belongs to positive
// numbers and `bad` to losses/errors. A position from IBKR isn't "bad",
// and a Freedom position isn't "good". Applied as a pill on the broker
// label and a 2 px left-border tint on the row when the row is not
// currently selected (selection uses solid mint, which takes precedence
// so the selected state still pops).
function brokerStyle(broker: string): { chip: string; borderLeft: string } {
  const norm = broker.toUpperCase();
  if (norm === "FF" || norm.startsWith("FREEDOM")) {
    return {
      chip: "bg-brand-freedom/15 text-brand-freedom border border-brand-freedom/30",
      borderLeft: "border-l-brand-freedom/40",
    };
  }
  if (norm === "IBKR") {
    return {
      chip: "bg-brand-ibkr/15 text-brand-ibkr border border-brand-ibkr/30",
      borderLeft: "border-l-brand-ibkr/40",
    };
  }
  if (norm === "CB" || norm.startsWith("COINBASE")) {
    return {
      chip: "bg-brand-coinbase/15 text-brand-coinbase border border-brand-coinbase/30",
      borderLeft: "border-l-brand-coinbase/40",
    };
  }
  return { chip: "bg-panel2 text-muted", borderLeft: "border-l-transparent" };
}

export function PositionsSection({
  title,
  count,
  rows,
  onSelect,
  selectedSymbol,
  showToggle = false,
}: {
  title: string;
  count: number;
  rows: Row[];
  /** Called with the row's symbol when the user clicks it. Selection is
   *  client state (instant open) — no navigation, no server round-trip. */
  onSelect: (symbol: string) => void;
  selectedSymbol?: string | null;
  /** Render the Broker/Net toggle in the section header. Show on the first
   *  section only so the page doesn't repeat the same control. */
  showToggle?: boolean;
}) {
  const { mode } = usePnlMode();
  if (rows.length === 0) return null;
  // Computed once per render so every row's freshness check uses the
  // same baseline. The default-`new Date()`-each-row alternative would
  // be slightly racier and would re-allocate per iteration.
  const todayIso = new Date().toISOString().slice(0, 10);
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
      <div className="hidden lg:grid grid-cols-[1.5fr_0.55fr_0.55fr_0.5fr_0.65fr_0.65fr_0.75fr_0.85fr_0.85fr_0.85fr_0.55fr] gap-0 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
        <span>Holding</span>
        <span>Broker</span>
        <span
          className="cursor-help"
          title="Where this row's price came from. 📄 is the broker statement (FF/IB) — refreshes only on upload; 📡 is a live API (FMP/Twelve Data/Yahoo/Stooq/CoinGecko) — refreshes on the daily quote cron. Hover any row's chip for the exact provider, price date, and cache age."
        >Src&nbsp;ⓘ</span>
        <span className="text-right">Qty</span>
        <span
          className="text-right cursor-help"
          title="Cost basis uses FIFO — Germany's §20 EStG requires it for Anlage KAP. Brokers usually display average-cost in their UI, so a 1-3% gap on positions with realized sells is expected (FIFO attributes the gain on the sold share to the oldest lot, avg-cost spreads it across all lots)."
        >Avg €&nbsp;ⓘ</span>
        <span className="text-right">Price €</span>
        <span
          className="text-right cursor-help"
          title="FIFO cost basis (German tax method). May differ from your broker's UI by 1-3% on positions with realized sells — see the Avg € header tooltip."
        >Cost €&nbsp;ⓘ</span>
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
        // Stale = the *price date* is past the project-wide freshness
        // threshold (see classifyQuoteFreshness — 5 calendar days, same
        // policy the quote-status table uses). Lots of UCITS ETFs land
        // here when our API chain can't price them and the only quote
        // we have is from a months-old statement upload.
        const isStale = classifyQuoteFreshness(r.asOf ?? null, todayIso) === "stale";
        // Inline style (not Tailwind) — the hex is an arbitrary value that
        // Tailwind's JIT can't pre-extract from a conditional className.
        const staleStyle = isStale ? { boxShadow: "inset 0px -14px 21px -16px #FFE61C" } : undefined;
        return (
          <button
            key={r.symbol}
            type="button"
            onClick={() => onSelect(r.symbol)}
            style={staleStyle}
            className={`w-full text-left flex flex-col gap-2 px-4 py-3 min-h-[68px] cursor-pointer hover:bg-panel2/50 border-l-2 lg:grid lg:grid-cols-[1.5fr_0.55fr_0.55fr_0.5fr_0.65fr_0.65fr_0.75fr_0.85fr_0.85fr_0.85fr_0.55fr] lg:gap-0 lg:px-5 lg:py-3 lg:items-center ${
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
                  {r.distribution && (
                    <span
                      title={
                        r.distribution.policy === "DISTRIBUTING"
                          ? `Distributing${r.distribution.frequency ? ` · ${r.distribution.frequency}` : ""}`
                          : "Accumulating — Vorabpauschale applies (§18 InvStG)"
                      }
                      className={`font-mono text-[10px] ml-1 px-1 py-0.5 rounded ${
                        r.distribution.policy === "DISTRIBUTING" ? "bg-mint/10 text-mint" : "bg-amber/10 text-amber"
                      }`}
                    >
                      {r.distribution.policy === "DISTRIBUTING" ? "Dist" : "Acc"}
                    </span>
                  )}
                  {r.formerTickers && r.formerTickers.length > 0 && (
                    <span
                      title={`Ticker changed — previously traded as ${r.formerTickers.join(", ")}. Cost basis and holding period carry across the rename.`}
                      className="font-mono text-[10px] ml-1 px-1 py-0.5 rounded bg-panel2 text-dim"
                    >
                      was {r.formerTickers.join(", ")}
                    </span>
                  )}
                  <span className="lg:hidden font-mono text-[10px] text-dim ml-1">
                    · avg {v.avgCostEur.toFixed(2)} · {r.pricePerUnitEur === null ? "—" : r.pricePerUnitEur.toFixed(2)}
                  </span>
                </div>
                {r.name && <div className="text-[11px] text-muted truncate">{r.name}</div>}
              </div>
            </div>

            {/* Line 2 (mobile only): broker pill · source · qty · value €.
                On lg, the broker pill / source / qty / avg / price / value cells render directly as grid cells. */}
            <div className="flex items-center justify-between gap-3 lg:hidden">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] tracking-wider w-fit ${bk.chip}`}>{r.broker}</span>
                <QuoteSourceIndicator source={r.quoteSource} asOf={r.asOf} updatedAt={r.quoteUpdatedAt} stale={isStale} />
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

            {/* Desktop-only grid cells (cols 2-10). Hidden on mobile because lines 2/3 above already
                surface this data in a stacked form. */}
            <span className={`hidden lg:inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] tracking-wider w-fit ${bk.chip}`}>{r.broker}</span>
            <span className="hidden lg:inline-flex">
              <QuoteSourceIndicator source={r.quoteSource} asOf={r.asOf} updatedAt={r.quoteUpdatedAt} stale={isStale} />
            </span>
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
          </button>
        );
      })}
    </Card>
  );
}
