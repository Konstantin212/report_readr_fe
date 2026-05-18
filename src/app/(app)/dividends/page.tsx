import { requireCurrentUser } from "@/lib/auth/server";
import { getDividendsData } from "@/lib/data/dividends";
import { Card } from "@/components/pulse/card";
import { BrokerFilter } from "@/components/pulse/broker-filter";
import { ProgressBar } from "@/components/pulse/progress-bar";
import { DividendMonthlyBars } from "@/components/pulse/dividend-monthly-bars";
import { UpcomingList } from "@/components/pulse/upcoming-list";
import { TopPayersList } from "@/components/pulse/top-payers-list";

type SP = Promise<{ broker?: string }>;

export default async function DividendsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const broker = (params.broker === "ff" || params.broker === "ibkr" ? params.broker : "all") as "all" | "ff" | "ibkr";
  const d = await getDividendsData(user.id, broker);

  const fmtEur = (v: number, dec = 2) => "€" + v.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dividends</h1>
        <BrokerFilter active={broker} />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-4">
        <Card className="relative overflow-hidden">
          <div className="absolute right-[-60px] top-[-60px] w-[220px] h-[220px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,210,74,0.13) 0%, transparent 70%)" }} />
          <div className="font-mono text-[11px] text-muted uppercase tracking-widest">Dividends · YTD {new Date().getFullYear()}</div>
          <div className="font-bold text-[64px] num tracking-tight leading-none mt-2 text-amber">
            {fmtEur(d.hero.ytdEur).split(",")[0]}<span className="text-[28px] opacity-60">,{(fmtEur(d.hero.ytdEur).split(",")[1] ?? "00")}</span>
          </div>
          <div className="flex gap-4 mt-4 items-center relative font-mono text-xs">
            {d.hero.yoyPct !== null && (
              <div className={`px-3 py-1.5 rounded-full font-semibold ${d.hero.yoyPct >= 0 ? "bg-mint/20 text-mint" : "bg-bad/20 text-bad"}`}>
                {d.hero.yoyPct >= 0 ? "↗" : "↘"} {(d.hero.yoyPct >= 0 ? "+" : "") + d.hero.yoyPct.toFixed(1)}% vs YTD {new Date().getFullYear() - 1}
              </div>
            )}
            <div className="text-muted">
              <span className="text-ink font-semibold">{d.hero.distributionCount}</span> distributions · <span className="text-ink font-semibold">{fmtEur(d.hero.whtPaidEur)}</span> WHT paid
            </div>
          </div>
        </Card>

        <Card>
          <div className="font-mono text-[11px] text-muted uppercase tracking-widest">Yield on cost</div>
          <div className="font-bold text-[36px] num tracking-tight text-mint mt-2">
            {d.yield.pct.toFixed(2)}<span className="text-[18px] opacity-60">%</span>
          </div>
          <div className="font-mono text-[11px] text-dim mt-1">annualized · trailing 12 months</div>
          <div className="mt-4">
            <ProgressBar pct={Math.min(100, (d.yield.pct / d.yield.targetPct) * 100)} height={6} />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-dim mt-1">
            <span>0%</span><span>target {d.yield.targetPct}%</span>
          </div>
        </Card>

        <Card>
          <div className="font-mono text-[11px] text-muted uppercase tracking-widest">Projection {new Date().getFullYear()}</div>
          <div className="font-bold text-[36px] num tracking-tight mt-2">{fmtEur(d.projection.yearEur, 0)}</div>
          <div className="font-mono text-[11px] text-dim mt-1">based on TTM rate</div>
          <div className="mt-4 px-3 py-2 bg-panel2 rounded-md font-mono text-xs text-muted">
            Next 30 days · <span className="text-amber font-semibold">{fmtEur(d.projection.next30DaysEur, 0)}</span>
            {d.projection.next30Count > 0 && <> from {d.projection.next30Count} holdings</>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <Card>
          <div className="flex justify-between items-baseline mb-3">
            <div className="font-semibold text-[14px]">Monthly distributions</div>
            <div className="font-mono text-[11px] text-muted">last 12 months</div>
          </div>
          <DividendMonthlyBars values={d.monthly.values} monthLabels={d.monthly.labels} highlightIdx={d.monthly.highlightIdx} />
        </Card>
        <Card>
          <div className="flex justify-between items-baseline mb-3">
            <div className="font-semibold text-[14px]">Upcoming</div>
            <div className="font-mono text-[11px] text-muted">next 30 days</div>
          </div>
          <UpcomingList items={[]} />
        </Card>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <Card className="p-0 overflow-hidden">
          <div className="flex justify-between items-center px-5 py-3 border-b border-border">
            <div className="font-semibold text-[14px]">All distributions · {new Date().getFullYear()}</div>
            <a href={`/api/dividends/export.csv`} className="font-mono text-[11px] text-muted hover:text-ink">export csv →</a>
          </div>
          <div className="grid grid-cols-[0.9fr_0.7fr_0.6fr_0.9fr_0.8fr] gap-0 px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
            <span>Date</span>
            <span>Ticker</span>
            <span>Broker</span>
            <span className="text-right">Gross</span>
            <span className="text-right">WHT</span>
          </div>
          {d.rows.length === 0 && <div className="p-6 text-muted text-sm">No dividends recorded.</div>}
          {d.rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[0.9fr_0.7fr_0.6fr_0.9fr_0.8fr] gap-0 px-5 py-2.5 font-mono text-xs border-b border-border last:border-0">
              <span className="text-muted">{r.date}</span>
              <span className="text-ink font-semibold">{r.ticker}</span>
              <span className="text-muted">{r.broker}</span>
              <span className="text-right text-amber">{r.ccy} {r.amount.toFixed(2)}</span>
              <span className="text-right text-muted">−{r.ccy} {r.whtEur.toFixed(2)}</span>
            </div>
          ))}
        </Card>
        <Card>
          <div className="font-semibold text-[14px] mb-3">Top payers · TTM</div>
          <TopPayersList items={d.topPayers} />
        </Card>
      </div>
    </main>
  );
}
