import { requireCurrentUser } from "@/lib/auth/server";
import { getTaxData, getAvailableTaxYears } from "@/lib/data/tax";
import { Card } from "@/components/pulse/card";
import { ProgressBar } from "@/components/pulse/progress-bar";
import { TaxYearSelector } from "@/components/pulse/tax-year-selector";
import { MetricsGrid } from "@/components/pulse/metrics-grid";
import { RealizedLotsTable } from "@/components/pulse/realized-lots-table";
import { fmtEur } from "@/lib/format";

export default async function TaxPage({ params }: { params: Promise<{ year: string }> }) {
  const user = await requireCurrentUser();
  const { year } = await params;
  const yearNum = Number(year);
  const [d, availableYears] = await Promise.all([
    getTaxData(user.id, yearNum),
    getAvailableTaxYears(user.id),
  ]);

  // How much of the saver's allowance is left in the selected year, in EUR.
  const allowanceRemainingEur = Math.max(0, d.allowance.totalEur - d.allowance.usedEur);
  const allowanceExceeded = d.allowance.usedEur >= d.allowance.totalEur;

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Tax{" "}
          <span className="font-mono text-sm text-muted ml-1 tracking-wider">{yearNum} · Germany</span>
        </h1>
        <div className="flex-1" />
        <TaxYearSelector years={availableYears} activeYear={yearNum} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <Card className="relative overflow-hidden">
          <div className="absolute right-[-40px] top-[-40px] w-[220px] h-[220px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,210,74,0.13) 0%, transparent 70%)" }} />
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted uppercase tracking-widest">
            <span>Tax year {d.year} · Germany</span>
            <span className="px-2 py-0.5 rounded-full bg-amber/20 text-amber text-[10px]">DRAFT</span>
          </div>
          <div className="mt-4 relative">
            <MetricsGrid
              columns={3}
              metrics={[
                {
                  label: "Net realized",
                  value: fmtEur(d.hero.netRealizedEur, { sign: true }),
                  subline: `${d.realizedLots.length} matches`,
                  accent: "auto",
                  sign: d.hero.netRealizedEur,
                },
                {
                  label: "Taxable base",
                  value: fmtEur(d.hero.taxableBaseEur),
                  subline: `after €${d.allowance.totalEur} Pauschbetrag`,
                },
                {
                  label: "Estimated tax",
                  value: fmtEur(d.hero.estTaxEur),
                  subline: "~26.4% AbgSt + SolZ",
                  accent: "amber",
                },
              ]}
            />
          </div>
        </Card>

        <Card>
          <div className="flex justify-between items-center">
            <div className="font-semibold text-sm">Saver&apos;s allowance</div>
            <div className="font-mono text-[11px] text-muted">Sparer-Pauschbetrag</div>
          </div>
          <div className="mt-4 font-mono text-[11px] text-muted flex justify-between">
            <span>Used</span>
            <span><span className="text-ink font-semibold">{fmtEur(d.allowance.usedEur, { dec: 0 })}</span> of €{d.allowance.totalEur.toLocaleString("de-DE")}</span>
          </div>
          <div className="mt-2">
            <ProgressBar pct={d.allowance.pct} fill="linear-gradient(90deg, var(--accent-mint, #7CFFB2), var(--accent-amber, #FFD24A))" height={10} />
          </div>
          <div className={`mt-2 font-mono text-[11px] ${allowanceExceeded ? "text-bad" : "text-mint"}`}>
            {allowanceExceeded
              ? `Exceeded by ${fmtEur(d.allowance.usedEur - d.allowance.totalEur, { dec: 0 })} — gains above this are taxable`
              : `${fmtEur(allowanceRemainingEur, { dec: 0 })} of tax-free room remaining`}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[10px] text-dim">
            <div>
              <div className="uppercase tracking-widest">Dividends</div>
              <div className="text-muted text-[11px] mt-0.5">{fmtEur(d.allowance.breakdown.dividendsEur, { dec: 0 })}</div>
            </div>
            <div>
              <div className="uppercase tracking-widest">Realised</div>
              <div className={`text-[11px] mt-0.5 ${d.allowance.breakdown.realizedGainsEur >= 0 ? "text-muted" : "text-bad"}`}>{fmtEur(d.allowance.breakdown.realizedGainsEur, { sign: true, dec: 0 })}</div>
            </div>
            <div>
              <div className="uppercase tracking-widest">Interest</div>
              <div className="text-muted text-[11px] mt-0.5">{fmtEur(d.allowance.breakdown.interestEur, { dec: 0 })}</div>
            </div>
          </div>

          {d.forecast && (() => {
            const f = d.forecast;
            const forecastExceeded = f.usedEur >= d.allowance.totalEur;
            const forecastRoom = Math.max(0, d.allowance.totalEur - f.usedEur);
            return (
              <div className="mt-5 pt-4 border-t border-dashed border-border">
                <div className="flex justify-between items-center">
                  <div className="font-mono text-[11px] text-muted">
                    Forecast by Dec 31
                  </div>
                  <div className="font-mono text-[10px] text-dim">
                    +{fmtEur(f.additionalDividendsEur, { dec: 0 })} in projected dividends · {f.daysRemaining}d left
                  </div>
                </div>
                <div className="mt-3 font-mono text-[11px] text-muted flex justify-between">
                  <span>Projected used</span>
                  <span>
                    <span className="text-ink font-semibold">{fmtEur(f.usedEur, { dec: 0 })}</span> of €{d.allowance.totalEur.toLocaleString("de-DE")}
                  </span>
                </div>
                <div className="mt-2">
                  {/* Striped fill marks the forecast bar as projected rather than realised. */}
                  <ProgressBar
                    pct={f.pct}
                    height={10}
                    fill="repeating-linear-gradient(45deg, var(--accent-amber, #FFD24A) 0 6px, rgba(255,210,74,0.45) 6px 12px)"
                  />
                </div>
                <div className={`mt-2 font-mono text-[11px] ${forecastExceeded ? "text-bad" : "text-mint"}`}>
                  {forecastExceeded
                    ? `Forecast exceeds allowance by ${fmtEur(f.taxableBaseEur, { dec: 0 })}`
                    : `${fmtEur(forecastRoom, { dec: 0 })} likely to remain unused`}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="bg-panel2 rounded-md px-3 py-2.5 border border-dashed border-amber/30">
                    <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Forecast taxable base</div>
                    <div className="font-bold text-lg num mt-0.5">{fmtEur(f.taxableBaseEur, { dec: 0 })}</div>
                  </div>
                  <div className="bg-panel2 rounded-md px-3 py-2.5 border border-dashed border-amber/30">
                    <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Forecast tax</div>
                    <div className="font-bold text-lg num mt-0.5 text-amber">{fmtEur(f.estTaxEur, { dec: 0 })}</div>
                  </div>
                </div>
                <div className="mt-2 font-mono text-[10px] text-dim leading-relaxed">
                  Projection — held positions × TTM dividend run-rate × days remaining. Doesn&apos;t affect the export or Anlage KAP draft.
                </div>
              </div>
            );
          })()}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="bg-panel2 rounded-md px-3 py-2.5">
              <div className="font-mono text-[10px] text-dim uppercase tracking-widest">FX adjustments</div>
              <div className="font-bold text-lg num mt-0.5">{fmtEur(d.allowance.fxAdjustmentsEur, { sign: true })}</div>
            </div>
            <div className="bg-panel2 rounded-md px-3 py-2.5">
              <div className="font-mono text-[10px] text-dim uppercase tracking-widest">WHT paid</div>
              <div className="font-bold text-lg num mt-0.5">{fmtEur(d.allowance.whtPaidEur, { dec: 2 })}</div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <a className="flex-1 bg-mint text-bg font-mono text-[11px] uppercase tracking-widest text-center px-3 py-2.5 rounded-md font-semibold" href={`/tax/${year}/export?format=pdf`}>Export PDF · Anlage KAP</a>
            <a className="border border-borderHard text-ink font-mono text-[11px] uppercase tracking-widest px-3 py-2.5 rounded-md font-semibold" href={`/tax/${year}/export?format=csv`}>CSV</a>
          </div>
          <a
            href={`/tax/${year}/anlage-so`}
            className="mt-3 block bg-panel2 border border-mint/30 rounded-md px-3 py-2.5 hover:border-mint/60 transition-colors"
          >
            <div className="flex justify-between items-baseline">
              <div className="font-mono text-[11px] uppercase tracking-widest text-mint">Anlage SO →</div>
              <div className="font-mono text-[10px] text-muted">§22 Nr. 3 EStG · Krypto-Staking</div>
            </div>
            <div className="font-mono text-[10px] text-dim mt-1">Separate report for Coinbase staking income</div>
          </a>
          <a
            href={`/tax/${year}/loss-harvest`}
            className="mt-2 block bg-panel2 border border-amber/30 rounded-md px-3 py-2.5 hover:border-amber/60 transition-colors"
          >
            <div className="flex justify-between items-baseline">
              <div className="font-mono text-[11px] uppercase tracking-widest text-amber">Loss Harvest →</div>
              <div className="font-mono text-[10px] text-muted">§20 Abs. 6 EStG · Pauschbetrag optimiser</div>
            </div>
            <div className="font-mono text-[10px] text-dim mt-1">Sell-at-a-loss candidates to stay under €{d.allowance.totalEur.toLocaleString("de-DE")}</div>
          </a>
        </Card>
      </div>

      <RealizedLotsTable
        lots={d.realizedLots}
        year={yearNum}
        totalCostEur={d.realizedLots.reduce((s, l) => s + l.costEur, 0)}
        totalProceedsEur={d.realizedLots.reduce((s, l) => s + l.proceedsEur, 0)}
        netRealizedEur={d.hero.netRealizedEur}
      />

      <div className="flex gap-2 font-mono text-[11px] text-dim">
        <span>ℹ</span>
        <span>Cost basis matched per Finanzamt rules (FIFO). USD/HKD/GBP converted using ECB reference rates on each trade date. Confirm with your Steuerberater before filing.</span>
      </div>
    </main>
  );
}
