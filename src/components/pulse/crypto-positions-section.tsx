import { Card } from "@/components/pulse/card";
import type { CryptoPosition, CryptoPortfolioRollup } from "@/lib/data/crypto-positions";

/**
 * Stand-alone Crypto positions table. Sits below the stock positions on
 * /positions and is intentionally separate — different schema (no ISIN,
 * no sector, no dividends), different tax treatment, different mental
 * model. Hidden entirely when the user has no crypto rows.
 */
export function CryptoPositionsSection({
  positions,
  rollup,
}: {
  positions: CryptoPosition[];
  rollup: CryptoPortfolioRollup;
}) {
  if (positions.length === 0) return null;

  const fmtEur = (v: number, dec = 2) =>
    `€${v.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
  const fmtQty = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 8 });
  const fmtPnl = (v: number) =>
    `${v >= 0 ? "+" : "−"}€${Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex justify-between items-center">
        <div>
          <div className="font-semibold text-sm">Crypto · Coinbase</div>
          <div className="font-mono text-[10px] text-muted mt-0.5">
            {positions.length} coin{positions.length === 1 ? "" : "s"} · cost basis from sync history (buy events only)
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] text-muted uppercase tracking-widest">Total value</div>
          <div className="font-bold text-[18px] num tracking-tight">{fmtEur(rollup.totalValueEur)}</div>
          <div
            className={`font-mono text-[11px] ${rollup.unrealizedPnlEur >= 0 ? "text-mint" : "text-bad"}`}
          >
            {fmtPnl(rollup.unrealizedPnlEur)} · {fmtPct(rollup.unrealizedPnlPct)}
          </div>
          {rollup.realizedPnlYtdEur !== 0 && (
            <div className={`font-mono text-[10px] mt-0.5 ${rollup.realizedPnlYtdEur >= 0 ? "text-mint" : "text-bad"}`}>
              {fmtPnl(rollup.realizedPnlYtdEur)} realized YTD
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[0.7fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_0.7fr] gap-0 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
        <span>Coin</span>
        <span className="text-right">Quantity</span>
        <span className="text-right">Avg cost</span>
        <span className="text-right">Spot price</span>
        <span className="text-right">Cost basis</span>
        <span className="text-right">Value</span>
        <span className="text-right">P/L</span>
      </div>
      {positions.map((p) => (
        <div
          key={p.symbol}
          className="grid grid-cols-[0.7fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_0.7fr] gap-0 px-5 py-3 font-mono text-[13px] items-center border-b border-border last:border-0"
        >
          <span className="font-semibold">{p.symbol}</span>
          <span className="text-right text-muted">{fmtQty(p.quantity)}</span>
          <span className="text-right text-muted">{p.avgPriceEur !== null ? fmtEur(p.avgPriceEur, 4) : "—"}</span>
          <span className="text-right">{p.currentPriceEur !== null ? fmtEur(p.currentPriceEur, 4) : "—"}</span>
          <span className="text-right text-muted">{fmtEur(p.costBasisEur)}</span>
          <span className="text-right">{fmtEur(p.currentValueEur)}</span>
          <span className={`text-right font-semibold ${p.unrealizedPnlEur >= 0 ? "text-mint" : "text-bad"}`}>
            <div>{fmtPnl(p.unrealizedPnlEur)}</div>
            <div className={`text-[10px] ${p.unrealizedPnlEur >= 0 ? "text-mint/70" : "text-bad/70"}`}>
              {fmtPct(p.unrealizedPnlPct)}
            </div>
          </span>
        </div>
      ))}
      <div className="grid grid-cols-[0.7fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_0.7fr] gap-0 px-5 py-3 bg-panel2 font-mono text-[13px] font-semibold border-t border-borderHard">
        <span className="col-span-4 font-mono text-[10px] text-muted uppercase tracking-widest">Σ Crypto total</span>
        <span className="text-right">{fmtEur(rollup.totalCostEur)}</span>
        <span className="text-right">{fmtEur(rollup.totalValueEur)}</span>
        <span className={`text-right ${rollup.unrealizedPnlEur >= 0 ? "text-mint" : "text-bad"}`}>
          {fmtPnl(rollup.unrealizedPnlEur)}
        </span>
      </div>
      <div className="px-5 py-2 font-mono text-[10px] text-dim border-t border-border">
        Cost basis = buys + staking rewards (at receipt EUR) − sells. Realized YTD = sum of §23 FIFO matches closed this
        year. Spot prices snapshotted at last sync.
      </div>
    </Card>
  );
}
