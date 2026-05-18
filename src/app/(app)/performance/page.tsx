import { requireCurrentUser } from "@/lib/auth/server";
import { getPerformanceSummary } from "@/lib/data/performance";
import { Card } from "@/components/pulse/card";
import { MetricTile } from "@/components/pulse/metric-tile";

export default async function PerformancePage() {
  const user = await requireCurrentUser();
  const s = await getPerformanceSummary(user.id);
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Performance</h1>
      <Card>
        <div className="font-mono uppercase tracking-widest text-xs text-muted">Realized P/L · all time</div>
        <div className={`font-bold text-5xl mt-2 num ${s.totalGain >= 0 ? "text-mint" : "text-bad"}`}>
          {s.totalGain >= 0 ? "+" : "−"}€{Math.abs(s.totalGain).toFixed(2)}
        </div>
        <div className="font-mono text-xs text-muted mt-2">{s.matchCount} realized lots</div>
      </Card>
      <div className="grid grid-cols-3 gap-4">
        <MetricTile label="Winners" value={String(s.wins)} accent="mint" />
        <MetricTile label="Losers" value={String(s.losses)} accent="bad" />
        <MetricTile label="Long-term (≥365d)" value={String(s.longTerm)} accent="amber" />
      </div>
    </main>
  );
}
