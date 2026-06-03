import { requireCurrentUser } from "@/lib/auth/server";
import { getDividendsData } from "@/lib/data/dividends";
import { Card } from "@/components/pulse/card";
import { ProgressBar } from "@/components/pulse/progress-bar";
import { DividendMonthlyBars } from "@/components/pulse/dividend-monthly-bars";
import { UpcomingList } from "@/components/pulse/upcoming-list";
import { TopPayersList } from "@/components/pulse/top-payers-list";
import { DividendsTable } from "@/components/pulse/dividends-table";
import { fmtEur } from "@/lib/format";

type SP = Promise<{ broker?: string; page?: string }>;

export default async function DividendsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const broker = (params.broker === "ff" || params.broker === "ibkr" ? params.broker : "all") as "all" | "ff" | "ibkr";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const d = await getDividendsData(user.id, broker, page);

  const preservedQuery: Record<string, string> = {};
  if (broker !== "all") preservedQuery.broker = broker;

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dividends</h1>
        {/* Broker filter lives in the global topbar; removed the
            duplicate that previously confused users. */}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr] gap-4">
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
          <div className="font-bold text-[36px] num tracking-tight mt-2">{fmtEur(d.projection.yearEur, { dec: 0 })}</div>
          <div className="font-mono text-[11px] text-dim mt-1">based on TTM rate</div>
          <div className="mt-4 px-3 py-2 bg-panel2 rounded-md font-mono text-xs text-muted">
            Next 30 days · <span className="text-amber font-semibold">{fmtEur(d.projection.next30DaysEur, { dec: 0 })}</span>
            {d.projection.next30Count > 0 && <> from {d.projection.next30Count} holdings</>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        <DividendsTable
          rows={d.rows}
          total={d.rowsTotal}
          page={d.page}
          pageSize={d.pageSize}
          year={new Date().getFullYear()}
          exportHref="/api/dividends/export.csv"
          basePath="/dividends"
          preservedQuery={preservedQuery}
        />
        <Card>
          <div className="font-semibold text-[14px] mb-3">Top payers · TTM</div>
          <TopPayersList items={d.topPayers} />
        </Card>
      </div>
    </main>
  );
}
