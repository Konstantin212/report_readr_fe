import { requireCurrentUser } from "@/lib/auth/server";
import { getTaxData, getAvailableTaxYears } from "@/lib/data/tax";
import { Card } from "@/components/pulse/card";
import { ProgressBar } from "@/components/pulse/progress-bar";
import { TaxYearSelector } from "@/components/pulse/tax-year-selector";

export default async function TaxPage({ params }: { params: Promise<{ year: string }> }) {
  const user = await requireCurrentUser();
  const { year } = await params;
  const yearNum = Number(year);
  const [d, availableYears] = await Promise.all([
    getTaxData(user.id, yearNum),
    getAvailableTaxYears(user.id),
  ]);

  const fmtEur = (v: number, opts: { sign?: boolean; dec?: number } = {}) => {
    const { sign = false, dec = 2 } = opts;
    const abs = Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const pre = sign ? (v >= 0 ? "+€" : "−€") : (v < 0 ? "−€" : "€");
    return `${pre}${abs}`;
  };

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
          <div className="grid grid-cols-3 gap-6 mt-3 relative">
            <div>
              <div className="font-mono text-[11px] text-dim uppercase tracking-widest">Net realized</div>
              <div className={`font-bold text-[36px] num tracking-tight mt-1 ${d.hero.netRealizedEur >= 0 ? "text-mint" : "text-bad"}`}>
                {fmtEur(d.hero.netRealizedEur, { sign: true })}
              </div>
              <div className="font-mono text-[11px] text-muted mt-1">{d.realizedLots.length} matches</div>
            </div>
            <div>
              <div className="font-mono text-[11px] text-dim uppercase tracking-widest">Taxable base</div>
              <div className="font-bold text-[36px] num tracking-tight mt-1">{fmtEur(d.hero.taxableBaseEur)}</div>
              <div className="font-mono text-[11px] text-muted mt-1">after €{d.allowance.totalEur} Pauschbetrag</div>
            </div>
            <div>
              <div className="font-mono text-[11px] text-dim uppercase tracking-widest">Estimated tax</div>
              <div className="font-bold text-[36px] num tracking-tight text-amber mt-1">{fmtEur(d.hero.estTaxEur)}</div>
              <div className="font-mono text-[11px] text-muted mt-1">~26.4% AbgSt + SolZ</div>
            </div>
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
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex justify-between items-center">
          <div className="font-semibold text-sm">Realized lots · FIFO matched</div>
          <div className="font-mono text-[11px] text-muted">{d.realizedLots.length} lots · ECB FX on trade date</div>
        </div>
        <div className="grid grid-cols-[0.9fr_0.7fr_0.5fr_1fr_1fr_0.6fr_1fr_1fr_1fr] gap-0 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
          <span>Ticker</span><span>Broker</span><span>Method</span><span>Opened</span><span>Closed</span><span className="text-right">Qty</span><span className="text-right">Cost EUR</span><span className="text-right">Proceeds</span><span className="text-right">Gain/Loss</span>
        </div>
        {d.realizedLots.length === 0 && <div className="p-6 text-muted text-sm">No realized lots for {year}.</div>}
        {d.realizedLots.map((l, i) => (
          <div key={i} className="grid grid-cols-[0.9fr_0.7fr_0.5fr_1fr_1fr_0.6fr_1fr_1fr_1fr] gap-0 px-5 py-3 font-mono text-[13px] items-center border-b border-border last:border-0">
            <span className="font-semibold">{l.ticker}</span>
            <span className="text-muted">{l.broker}</span>
            <span className="text-muted text-[10px] tracking-wider">{l.method}</span>
            <span className="text-muted">{l.opened}</span>
            <span>{l.closed}</span>
            <span className="text-right text-muted">{l.qty.toFixed(l.qty % 1 === 0 ? 0 : 4)}</span>
            <span className="text-right">{l.costEur.toLocaleString("de-DE", { minimumFractionDigits: 2 })}</span>
            <span className="text-right">{l.proceedsEur.toLocaleString("de-DE", { minimumFractionDigits: 2 })}</span>
            <span className={`text-right font-semibold ${l.gainEur >= 0 ? "text-mint" : "text-bad"}`}>
              {l.gainEur >= 0 ? "+" : "−"}{Math.abs(l.gainEur).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
            </span>
          </div>
        ))}
        {d.realizedLots.length > 0 && (
          <div className="grid grid-cols-[0.9fr_0.7fr_0.5fr_1fr_1fr_0.6fr_1fr_1fr_1fr] gap-0 px-5 py-3 bg-panel2 font-mono text-[13px] font-semibold border-t border-borderHard">
            <span className="col-span-6 font-mono text-[10px] text-muted uppercase tracking-widest">Σ Net realized</span>
            <span className="text-right">{d.realizedLots.reduce((s, l) => s + l.costEur, 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })}</span>
            <span className="text-right">{d.realizedLots.reduce((s, l) => s + l.proceedsEur, 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })}</span>
            <span className={`text-right ${d.hero.netRealizedEur >= 0 ? "text-mint" : "text-bad"}`}>
              {d.hero.netRealizedEur >= 0 ? "+" : "−"}{Math.abs(d.hero.netRealizedEur).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </Card>

      <div className="flex gap-2 font-mono text-[11px] text-dim">
        <span>ℹ</span>
        <span>Cost basis matched per Finanzamt rules (FIFO). USD/HKD/GBP converted using ECB reference rates on each trade date. Confirm with your Steuerberater before filing.</span>
      </div>
    </main>
  );
}
