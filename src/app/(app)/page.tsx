import { requireCurrentUser } from "@/lib/auth/server";
import { getDashboardData } from "@/lib/data/dashboard";
import { getCryptoSummary } from "@/lib/data/crypto-summary";
import { Card } from "@/components/pulse/card";
import { AllocationDonut } from "@/components/pulse/allocation-donut";
import { CurrencyBars } from "@/components/pulse/currency-bars";
import { DividendMiniBars } from "@/components/pulse/dividend-mini-bars";
import { PositionsPreview } from "@/components/pulse/positions-preview";
import { PerfChart } from "@/components/pulse/perf-chart";
import { CryptoCard } from "@/components/pulse/crypto-card";

type SP = Promise<{ broker?: string }>;

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const broker = (params.broker === "ff" || params.broker === "ibkr" ? params.broker : "all") as "all" | "ff" | "ibkr";
  const [d, crypto] = await Promise.all([getDashboardData(user.id, broker), getCryptoSummary(user.id)]);

  const fmtEur = (v: number, opts: { sign?: boolean; dec?: number } = {}) => {
    const { sign = false, dec = 2 } = opts;
    const abs = Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const pre = sign ? (v >= 0 ? "+€" : "−€") : (v < 0 ? "−€" : "€");
    return `${pre}${abs}`;
  };
  const fmtPct = (v: number | null) => {
    if (v === null) return "—";
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  };

  return (
    <main className="space-y-4">
      {/* Hero row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-4">
        <Card className="relative overflow-hidden">
          <div className="absolute right-[-60px] top-[-60px] w-[280px] h-[280px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(124,255,178,0.13) 0%, transparent 70%)" }} />
          <div className="relative flex justify-between items-baseline">
            <div className="font-mono text-[11px] text-muted tracking-widest uppercase">
              Portfolio value · {broker === "all" ? "Combined" : broker === "ff" ? "Freedom Finance" : "Interactive Brokers"}
            </div>
            <div className="font-mono text-[11px] text-dim tracking-wider">{d.hero.positionCount} positions</div>
          </div>
          <div className="font-bold text-[56px] num leading-[1.05] mt-1 tracking-tight">
            {fmtEur(d.hero.valueEur)}
          </div>
          <div className="flex gap-4 mt-3 relative font-mono text-[13px] items-center">
            {d.hero.dayChangeEur !== null && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold ${
                d.hero.dayChangeEur >= 0 ? "bg-mint/20 text-mint" : "bg-bad/20 text-bad"
              }`}>
                <span>{d.hero.dayChangeEur >= 0 ? "↗" : "↘"}</span>
                <span className="num">{fmtEur(d.hero.dayChangeEur, { sign: true })}</span>
                <span className="opacity-70 num">{fmtPct(d.hero.dayChangePct)}</span>
                <span className="text-muted ml-1">today</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted">
              <span>All-time</span>
              <span className="text-ink num">{fmtEur(d.hero.totalReturnEur, { sign: true })}</span>
              <span className="text-mint num">{fmtPct(d.hero.totalReturnPct)}</span>
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <div className="font-mono text-[11px] text-muted tracking-widest uppercase">Unrealized P/L</div>
            <div className={`font-bold text-[30px] num mt-2 tracking-tight ${d.tiles.unrealizedEur >= 0 ? "text-mint" : "text-bad"}`}>
              {fmtEur(d.tiles.unrealizedEur, { sign: true })}
            </div>
            <div className="font-mono text-[11px] text-dim mt-1">{fmtPct(d.tiles.unrealizedPct)}</div>
          </Card>
          <Card>
            <div className="font-mono text-[11px] text-muted tracking-widest uppercase">Realized YTD</div>
            <div className="font-bold text-[30px] num mt-2 tracking-tight text-amber">
              {fmtEur(d.tiles.realizedYtdEur, { sign: true })}
            </div>
            <div className="font-mono text-[11px] text-dim mt-1">taxable basis</div>
          </Card>
        </div>
      </div>

      {/* Chart + allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        <Card>
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="font-semibold text-[15px]">Performance</div>
              <div className="font-mono text-[11px] text-muted mt-1">vs S&amp;P 500 · last 24 months</div>
            </div>
          </div>
          {d.equityCurve.portfolio.length > 0 ? (
            <div className="h-[230px]">
              <PerfChart values={d.equityCurve.portfolio} benchmark={d.equityCurve.benchmark.length > 0 ? d.equityCurve.benchmark : undefined} style="area" />
            </div>
          ) : (
            <div className="h-[230px] flex items-center justify-center text-muted text-sm">No chart yet — history backfilling.</div>
          )}
        </Card>
        <Card>
          <div className="font-semibold text-[15px] mb-3">Allocation</div>
          {d.allocation.length > 0 ? (
            <AllocationDonut data={d.allocation} centerLabel={String(d.hero.positionCount)} centerSublabel="positions" />
          ) : (
            <div className="text-muted text-sm py-6">No positions yet.</div>
          )}
        </Card>
      </div>

      {/* Currency + dividends + top positions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.6fr] gap-4">
        <Card>
          <div className="font-semibold text-[14px] mb-3">Currency exposure</div>
          {d.currency.length > 0 ? <CurrencyBars data={d.currency} /> : <div className="text-muted text-sm">No data yet.</div>}
        </Card>
        <Card>
          <div className="flex justify-between items-baseline mb-2">
            <div className="font-semibold text-[14px]">Dividends YTD</div>
            <div className="font-mono text-[11px] text-muted">{new Date().getFullYear()}</div>
          </div>
          <div className="font-bold text-[32px] num text-amber tracking-tight">
            {fmtEur(d.dividendsYtd.totalEur)}
          </div>
          <div className="font-mono text-[11px] text-muted mt-1">€{d.dividendsYtd.whtEur.toFixed(2)} WHT paid</div>
          <div className="mt-4">
            <DividendMiniBars values={d.dividendsYtd.monthly} months={d.dividendsYtd.months} />
          </div>
        </Card>
        <Card>
          <div className="flex justify-between items-baseline mb-3">
            <div className="font-semibold text-[14px]">Top positions</div>
            <a href="/positions" className="font-mono text-[11px] text-muted hover:text-ink">view all →</a>
          </div>
          <PositionsPreview rows={d.topPositions} />
        </Card>
      </div>

      {crypto.hasAccounts && (
        <div className="grid grid-cols-1 gap-4">
          <CryptoCard summary={crypto} />
        </div>
      )}
    </main>
  );
}
