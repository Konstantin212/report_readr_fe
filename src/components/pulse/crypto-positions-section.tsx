import { DataTable, type Column } from "./data-table";
import { fmtEur, fmtPct, fmtQty } from "@/lib/format";
import type { CryptoPosition, CryptoPortfolioRollup } from "@/lib/data/crypto-positions";

/**
 * Stand-alone Crypto positions table. Sits below the stock positions on
 * /positions and is intentionally separate — different schema (no ISIN,
 * no sector, no dividends), different tax treatment, different mental
 * model. Hidden entirely when the user has no crypto rows.
 *
 * Uses DataTable for the same mobile-stacked / desktop-grid pattern as
 * the stock positions section. Previously had a 7-column inline grid
 * with no gutters that smashed numbers together on mobile.
 */
export function CryptoPositionsSection({
  positions,
  rollup,
}: {
  positions: CryptoPosition[];
  rollup: CryptoPortfolioRollup;
}) {
  if (positions.length === 0) return null;

  const fmtPnl = (v: number) => fmtEur(v, { sign: true });

  const columns: Column<CryptoPosition>[] = [
    { key: "coin", label: "Coin", gridCol: "0.7fr",
      cell: (p) => <span className="font-semibold">{p.symbol}</span> },
    { key: "qty", label: "Quantity", gridCol: "1fr", align: "right",
      cell: (p) => <span className="text-muted">{fmtQty(p.quantity)}</span> },
    { key: "avg", label: "Avg cost", gridCol: "0.9fr", align: "right",
      cell: (p) => <span className="text-muted">{p.avgPriceEur !== null ? fmtEur(p.avgPriceEur, { dec: 4 }) : "—"}</span> },
    { key: "spot", label: "Spot price", gridCol: "0.9fr", align: "right",
      cell: (p) => <span>{p.currentPriceEur !== null ? fmtEur(p.currentPriceEur, { dec: 4 }) : "—"}</span> },
    { key: "cost", label: "Cost basis", gridCol: "0.9fr", align: "right",
      cell: (p) => <span className="text-muted">{fmtEur(p.costBasisEur)}</span> },
    { key: "value", label: "Value", gridCol: "0.9fr", align: "right",
      cell: (p) => <span>{fmtEur(p.currentValueEur)}</span> },
    { key: "pl", label: "P/L", gridCol: "0.9fr", align: "right",
      cell: (p) => (
        <span className={`font-semibold flex flex-col ${p.unrealizedPnlEur >= 0 ? "text-mint" : "text-bad"}`}>
          <span>{fmtPnl(p.unrealizedPnlEur)}</span>
          <span className={`text-[10px] ${p.unrealizedPnlEur >= 0 ? "text-mint/70" : "text-bad/70"}`}>
            {fmtPct(p.unrealizedPnlPct)}
          </span>
        </span>
      ) },
  ];

  return (
    <DataTable<CryptoPosition>
      title="Crypto · Coinbase"
      meta={`${positions.length} coin${positions.length === 1 ? "" : "s"} · cost basis from sync history`}
      trailingHeader={
        <div className="text-right">
          <div className="font-mono text-[10px] text-muted uppercase tracking-widest">Total value</div>
          <div className="font-bold text-[18px] num tracking-tight">{fmtEur(rollup.totalValueEur)}</div>
          <div className={`font-mono text-[11px] ${rollup.unrealizedPnlEur >= 0 ? "text-mint" : "text-bad"}`}>
            {fmtPnl(rollup.unrealizedPnlEur)} · {fmtPct(rollup.unrealizedPnlPct)}
          </div>
          {rollup.realizedPnlYtdEur !== 0 && (
            <div className={`font-mono text-[10px] mt-0.5 ${rollup.realizedPnlYtdEur >= 0 ? "text-mint" : "text-bad"}`}>
              {fmtPnl(rollup.realizedPnlYtdEur)} realized YTD
            </div>
          )}
        </div>
      }
      columns={columns}
      rows={positions}
      rowKey={(p) => p.symbol}
      renderMobileCard={(p) => (
        <div className="flex flex-col gap-2">
          {/* Line 1: coin + value + P/L pill */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[14px]">{p.symbol}</span>
              <span className="font-mono text-[11px] text-muted">{fmtQty(p.quantity)}</span>
            </div>
            <div className="text-right">
              <div className="font-mono font-semibold text-[14px]">{fmtEur(p.currentValueEur)}</div>
              <div className={`font-mono text-[11px] ${p.unrealizedPnlEur >= 0 ? "text-mint" : "text-bad"}`}>
                {fmtPnl(p.unrealizedPnlEur)} · {fmtPct(p.unrealizedPnlPct)}
              </div>
            </div>
          </div>
          {/* Line 2: prices + cost */}
          <div className="flex items-center justify-between font-mono text-[11px] text-muted gap-3">
            <span><span className="text-dim mr-1">avg</span>{p.avgPriceEur !== null ? fmtEur(p.avgPriceEur, { dec: 4 }) : "—"}</span>
            <span><span className="text-dim mr-1">spot</span>{p.currentPriceEur !== null ? fmtEur(p.currentPriceEur, { dec: 4 }) : "—"}</span>
            <span><span className="text-dim mr-1">cost</span>{fmtEur(p.costBasisEur)}</span>
          </div>
        </div>
      )}
      summary={{
        desktopCells: [
          <span key="lbl" className="font-mono text-[10px] text-muted uppercase tracking-widest col-span-4">Σ Crypto total</span>,
          null, null, null,
          <span key="cost" className="text-right">{fmtEur(rollup.totalCostEur)}</span>,
          <span key="val" className="text-right">{fmtEur(rollup.totalValueEur)}</span>,
          <span key="pl" className={`text-right ${rollup.unrealizedPnlEur >= 0 ? "text-mint" : "text-bad"}`}>
            {fmtPnl(rollup.unrealizedPnlEur)}
          </span>,
        ],
        mobileLabel: "Σ Crypto total",
        mobileBody: (
          <div className="flex justify-between items-baseline gap-3">
            <span className="text-muted text-[11px]">
              cost {fmtEur(rollup.totalCostEur)} · value {fmtEur(rollup.totalValueEur)}
            </span>
            <span className={`text-[15px] ${rollup.unrealizedPnlEur >= 0 ? "text-mint" : "text-bad"}`}>
              {fmtPnl(rollup.unrealizedPnlEur)}
            </span>
          </div>
        ),
      }}
      footer={
        <>Cost basis = buys + staking rewards (at receipt EUR) − sells. Realized YTD = sum of §23 FIFO matches closed this year. Spot prices snapshotted at last sync.</>
      }
    />
  );
}
