import { requireCurrentUser } from "@/lib/auth/server";
import { getPerformanceData, type Range } from "@/lib/data/performance";
import { getCryptoPositions, rollUpCryptoPositions } from "@/lib/data/crypto-positions";
import { getCryptoSummary } from "@/lib/data/crypto-summary";
import { Card } from "@/components/pulse/card";
import { MetricTile } from "@/components/pulse/metric-tile";
import { PerfChart } from "@/components/pulse/perf-chart";
import { RangePicker } from "@/components/pulse/range-picker";
import { Heatmap } from "@/components/pulse/heatmap";
import { SectorContributionBars } from "@/components/pulse/sector-contribution-bars";

const RANGES = new Set(["1M","3M","6M","YTD","1Y","2Y","ALL"]);

type SP = Promise<{ broker?: string; range?: string }>;

export default async function PerformancePage({ searchParams }: { searchParams: SP }) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const broker = (params.broker === "ff" || params.broker === "ibkr" ? params.broker : "all") as "all" | "ff" | "ibkr";
  const range = (RANGES.has(params.range ?? "") ? params.range : "2Y") as Range;

  const [d, cryptoPositions, cryptoSummary] = await Promise.all([
    getPerformanceData(user.id, broker, range),
    getCryptoPositions(user.id),
    getCryptoSummary(user.id),
  ]);
  const cryptoRollup = rollUpCryptoPositions(cryptoPositions);

  const fmtPct = (v: number | null, dec = 1) => {
    if (v === null) return "—";
    return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
  };
  const fmtVal = (v: number | null, dec = 2) => v === null ? "—" : v.toFixed(dec);

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Performance{" "}
          <span className="font-mono text-sm text-muted ml-2 tracking-wider">
            vs S&amp;P 500 (USD-hedged)
          </span>
        </h1>
        <RangePicker active={range} />
      </div>

      {/* Hero chart card */}
      <Card>
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="font-mono text-[11px] text-muted uppercase tracking-widest">Equity curve · indexed to 100</div>
            <div className="flex flex-wrap gap-6 mt-3 items-baseline">
              <div>
                <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Portfolio</div>
                <div className="font-bold text-[36px] num leading-tight text-mint tracking-tight">{fmtPct(d.hero.portfolioReturnPct)}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-dim uppercase tracking-widest">S&amp;P 500</div>
                <div className="font-bold text-[28px] num leading-tight text-muted tracking-tight mt-1">{fmtPct(d.hero.benchmarkReturnPct)}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Alpha</div>
                <div className="font-bold text-[28px] num leading-tight text-amber tracking-tight mt-1">{fmtPct(d.hero.alphaPct)}</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {d.hero.alphaPct !== null && (
              <div className={`px-3 py-1 rounded-full font-mono text-[11px] tracking-wider ${
                d.hero.outperforming ? "bg-mint/15 text-mint" : "bg-bad/15 text-bad"
              }`}>
                ● {d.hero.outperforming ? "OUTPERFORMING" : "UNDERPERFORMING"}
              </div>
            )}
            <div className="font-mono text-[11px] text-dim">{d.hero.label}</div>
          </div>
        </div>
        {d.equityCurve.portfolio.length > 0 ? (
          <div className="h-[260px] lg:h-[360px] mt-2">
            <PerfChart
              values={d.equityCurve.portfolio}
              benchmark={d.equityCurve.benchmark.length > 0 ? d.equityCurve.benchmark : undefined}
              style="area"
            />
          </div>
        ) : (
          <div className="h-[260px] lg:h-[360px] flex items-center justify-center text-muted text-sm">
            Not enough history yet. Cron will backfill within 24 hours.
          </div>
        )}
      </Card>

      {/* 6 metric tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricTile label="TWR" value={fmtPct(d.metrics.twrPct)} sublabel="annualized" accent={d.metrics.twrPct !== null && d.metrics.twrPct >= 0 ? "mint" : "bad"} />
        <MetricTile label="MWR / IRR" value={fmtPct(d.metrics.mwrPct)} sublabel="money-weighted" />
        <MetricTile label="Volatility" value={fmtPct(d.metrics.volatilityPct, 1)} sublabel="annualized" />
        <MetricTile label="Max drawdown" value={fmtPct(d.metrics.drawdownPct)} sublabel="peak to trough" accent="bad" />
        <MetricTile label="Sharpe" value={fmtVal(d.metrics.sharpe)} sublabel="risk-adjusted" accent="amber" />
        <MetricTile label="Beta" value={fmtVal(d.metrics.beta)} sublabel="vs S&P 500" />
      </div>

      {cryptoSummary.hasAccounts && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <MetricTile
            label="Crypto value"
            value={`€${cryptoRollup.totalValueEur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sublabel="last sync · spot"
          />
          <MetricTile
            label="Unrealized P/L"
            value={`${cryptoRollup.unrealizedPnlEur >= 0 ? "+" : "−"}€${Math.abs(cryptoRollup.unrealizedPnlEur).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sublabel={cryptoRollup.unrealizedPnlPct === null ? "no cost basis" : `${cryptoRollup.unrealizedPnlPct >= 0 ? "+" : ""}${cryptoRollup.unrealizedPnlPct.toFixed(2)}%`}
            accent={cryptoRollup.unrealizedPnlEur >= 0 ? "mint" : "bad"}
          />
          <MetricTile
            label="Realized YTD"
            value={`${cryptoRollup.realizedPnlYtdEur >= 0 ? "+" : "−"}€${Math.abs(cryptoRollup.realizedPnlYtdEur).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sublabel="§23 matches"
            accent={cryptoRollup.realizedPnlYtdEur >= 0 ? "mint" : "bad"}
          />
          <MetricTile
            label={`Staking ${cryptoSummary.stakingYtd.year}`}
            value={`€${cryptoSummary.stakingYtd.totalEur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sublabel={cryptoSummary.stakingYtd.freigrenzeReached ? "above Freigrenze" : `of €${cryptoSummary.stakingYtd.freigrenzeEur} Freigrenze`}
            accent={cryptoSummary.stakingYtd.freigrenzeReached ? "bad" : "amber"}
          />
          <MetricTile
            label="Cost basis"
            value={`€${cryptoRollup.totalCostEur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sublabel={`${cryptoPositions.length} coin${cryptoPositions.length === 1 ? "" : "s"} · DCA`}
          />
        </div>
      )}

      {/* Heatmap + sector contribution */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        <Heatmap rows={d.heatmap} />
        <SectorContributionBars bars={d.sectorContribution} />
      </div>
    </main>
  );
}
