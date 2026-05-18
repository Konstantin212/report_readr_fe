import { requireCurrentUser } from "@/lib/auth/server";
import { getPositions } from "@/lib/data/positions";
import { Card } from "@/components/pulse/card";

export default async function PositionsPage() {
  const user = await requireCurrentUser();
  const rows = await getPositions(user.id);
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Positions <span className="text-muted font-mono text-sm ml-2">{rows.length}</span></h1>
      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-[1.5fr_0.6fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-0 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
          <span>Symbol</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Cost EUR</span>
          <span className="text-right">Market EUR</span>
          <span className="text-right">P/L</span>
          <span className="text-right">As of</span>
        </div>
        {rows.length === 0 && (
          <div className="px-5 py-6 text-muted text-sm">No open positions. Upload a statement to get started.</div>
        )}
        {rows.map(r => (
          <div key={r.symbol} className="grid grid-cols-[1.5fr_0.6fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-0 px-5 py-3 font-mono text-[12px] border-b border-border">
            <span className="text-ink font-semibold">{r.symbol}</span>
            <span className="text-right text-muted">{r.quantity}</span>
            <span className="text-right">€{r.costEur.toFixed(2)}</span>
            <span className="text-right">{r.marketEur === null ? "—" : "€" + r.marketEur.toFixed(2)}</span>
            <span className={`text-right font-semibold ${r.pl === null ? "text-muted" : r.pl >= 0 ? "text-mint" : "text-bad"}`}>
              {r.pl === null ? "—" : (r.pl >= 0 ? "+" : "−") + "€" + Math.abs(r.pl).toFixed(2)}
            </span>
            <span className="text-right text-dim text-[10px]">{r.asOf ?? "—"}</span>
          </div>
        ))}
      </Card>
    </main>
  );
}
