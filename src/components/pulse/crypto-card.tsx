import { Card } from "@/components/pulse/card";
import type { CryptoSummary } from "@/lib/data/crypto-summary";

/**
 * Dashboard tile for the connected Coinbase portfolio. Two rows:
 *   - top: portfolio EUR value + YTD staking with €256 Freigrenze bar
 *   - bottom: top holdings table (symbol · qty · EUR value · share)
 *
 * If no account is connected, render a stub Card pointing the user to
 * Settings instead of nothing — discoverability over silence.
 */
export function CryptoCard({ summary }: { summary: CryptoSummary }) {
  if (!summary.hasAccounts) {
    return (
      <Card>
        <div className="flex justify-between items-baseline mb-2">
          <div className="font-semibold text-[14px]">Crypto</div>
          <div className="font-mono text-[11px] text-dim tracking-wider">NOT CONNECTED</div>
        </div>
        <div className="text-muted text-sm">
          Connect Coinbase in{" "}
          <a href="/settings?section=crypto" className="text-mint underline">
            Settings → Crypto
          </a>{" "}
          to track balances and staking income.
        </div>
      </Card>
    );
  }

  const fmtEur = (v: number, dec = 2) =>
    `€${Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
  const fmtQty = (v: number) =>
    v.toLocaleString("en-US", { maximumFractionDigits: 8, minimumFractionDigits: 0 });

  const stk = summary.stakingYtd;
  const stkPct = stk.freigrenzeEur > 0 ? Math.min(100, (stk.totalEur / stk.freigrenzeEur) * 100) : 0;
  const stkColor = stk.freigrenzeReached ? "text-bad" : stkPct >= 80 ? "text-amber" : "text-mint";
  const stkBarColor = stk.freigrenzeReached ? "bg-bad" : stkPct >= 80 ? "bg-amber" : "bg-mint";

  const lastSyncLabel = summary.lastSyncAt
    ? new Date(summary.lastSyncAt).toISOString().slice(0, 16).replace("T", " ")
    : "never";

  return (
    <Card>
      <div className="flex justify-between items-baseline mb-3">
        <div>
          <div className="font-semibold text-[14px]">Crypto · Coinbase</div>
          <div className="font-mono text-[10px] text-dim mt-0.5">last sync {lastSyncLabel} UTC</div>
        </div>
        <div className="font-mono text-[10px] text-dim tracking-wider">{summary.walletCount} wallets</div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className="font-mono text-[10px] text-muted uppercase tracking-widest">Portfolio value</div>
          <div className="font-bold text-[28px] num tracking-tight mt-1">{fmtEur(summary.totalValueEur)}</div>
        </div>
        <div>
          <div className="font-mono text-[10px] text-muted uppercase tracking-widest">Realized {summary.realizedYtd.year}</div>
          <div className={`font-bold text-[28px] num tracking-tight mt-1 ${summary.realizedYtd.shortTermGainEur >= 0 ? "text-mint" : "text-bad"}`}>
            {summary.realizedYtd.shortTermGainEur >= 0 ? "+" : "−"}{fmtEur(Math.abs(summary.realizedYtd.shortTermGainEur))}
          </div>
          <div className="font-mono text-[10px] text-muted mt-1">
            §23 short-term · {summary.realizedYtd.matchCount} match{summary.realizedYtd.matchCount === 1 ? "" : "es"}
          </div>
        </div>
        <div>
          <div className="flex justify-between items-baseline">
            <div className="font-mono text-[10px] text-muted uppercase tracking-widest">Staking income {stk.year}</div>
            <div className="font-mono text-[10px] text-dim">§22 Nr. 3</div>
          </div>
          <div className={`font-bold text-[28px] num tracking-tight mt-1 ${stkColor}`}>{fmtEur(stk.totalEur)}</div>
          <div className="mt-2">
            <div className="h-1.5 bg-panel2 rounded-full overflow-hidden">
              <div className={`h-full ${stkBarColor}`} style={{ width: `${stkPct.toFixed(1)}%` }} />
            </div>
            <div className="flex justify-between items-baseline mt-1">
              <div className="font-mono text-[9px] text-dim">
                {stkPct.toFixed(0)}% of €{stk.freigrenzeEur} Freigrenze
              </div>
              {stk.freigrenzeReached && (
                <div className="font-mono text-[9px] text-bad">FILE ANLAGE SO</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {summary.topHoldings.length > 0 ? (
        <div className="border-t border-border pt-3">
          <div className="font-mono text-[10px] text-muted uppercase tracking-widest mb-2">Holdings</div>
          <div className="divide-y divide-border">
            {summary.topHoldings.map((h) => (
              <div key={h.symbol} className="grid grid-cols-[2fr_2fr_2fr_1fr] gap-2 py-2 items-center text-sm">
                <div className="font-semibold">{h.symbol}</div>
                <div className="font-mono text-[11px] text-muted num">{fmtQty(h.quantity)}</div>
                <div className="num">{fmtEur(h.eurValue)}</div>
                <div className="font-mono text-[10px] text-dim text-right num">{h.sharePct.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border-t border-border pt-3 text-muted text-sm">No balances yet. Run Sync now in Settings.</div>
      )}
    </Card>
  );
}
