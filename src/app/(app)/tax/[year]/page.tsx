import { requireCurrentUser } from "@/lib/auth/server";
import { getTaxData } from "@/lib/data/tax";
import { Card } from "@/components/pulse/card";
import { ProgressBar } from "@/components/pulse/progress-bar";

export default async function TaxPage({ params }: { params: Promise<{ year: string }> }) {
  const user = await requireCurrentUser();
  const { year } = await params;
  const yearNum = Number(year);
  const d = await getTaxData(user.id, yearNum);

  const fmtEur = (v: number, opts: { sign?: boolean; dec?: number } = {}) => {
    const { sign = false, dec = 2 } = opts;
    const abs = Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const pre = sign ? (v >= 0 ? "+€" : "−€") : (v < 0 ? "−€" : "€");
    return `${pre}${abs}`;
  };

  return (
    <main className="space-y-4">
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
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
