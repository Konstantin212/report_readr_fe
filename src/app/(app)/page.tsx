import { requireCurrentUser } from "@/lib/auth/server";
import { getDashboardSummary } from "@/lib/data/dashboard";
import { Card } from "@/components/pulse/card";

export default async function Dashboard() {
  const user = await requireCurrentUser();
  const summary = await getDashboardSummary(user.id);
  return (
    <main className="space-y-4">
      <Card>
        <div className="font-mono uppercase tracking-widest text-xs text-muted">
          Portfolio · Combined
        </div>
        <div className="font-bold text-5xl mt-2 num">{summary.positionCount} positions</div>
        <div className="text-mint mt-3 num">
          Realized YTD: €{summary.realizedYtd.toFixed(2)}
        </div>
      </Card>
    </main>
  );
}
