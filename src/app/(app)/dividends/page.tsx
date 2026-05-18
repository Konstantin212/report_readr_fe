import { requireCurrentUser } from "@/lib/auth/server";
import { getDividends } from "@/lib/data/dividends";
import { Card } from "@/components/pulse/card";

export default async function DividendsPage() {
  const user = await requireCurrentUser();
  const { rows, totalEur, whtTotalEur } = await getDividends(user.id);
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Dividends</h1>
      <Card>
        <div className="font-mono uppercase tracking-widest text-xs text-muted">All-time gross · EUR</div>
        <div className="font-bold text-5xl mt-2 num text-amber">€{totalEur.toFixed(2)}</div>
        <div className="font-mono text-xs text-muted mt-2">{rows.length} distributions · €{whtTotalEur.toFixed(2)} WHT paid</div>
      </Card>
      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-0 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
          <span>Date</span><span>Symbol</span><span className="text-right">Gross EUR</span><span className="text-right">WHT EUR</span>
        </div>
        {rows.length === 0 && <div className="px-5 py-6 text-muted text-sm">No dividends recorded.</div>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-0 px-5 py-2.5 font-mono text-[12px] border-b border-border">
            <span className="text-muted">{r.date}</span>
            <span className="text-ink">{r.symbol ?? "—"}</span>
            <span className="text-right text-amber">€{r.amount.toFixed(2)}</span>
            <span className="text-right text-muted">−€{r.whtEur.toFixed(2)}</span>
          </div>
        ))}
      </Card>
    </main>
  );
}
