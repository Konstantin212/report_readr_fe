import { requireCurrentUser } from "@/lib/auth/server";
import { buildAnlageSo } from "@/lib/tax/anlage-so";
import { Card } from "@/components/pulse/card";
import { ProgressBar } from "@/components/pulse/progress-bar";

export default async function AnlageSoPage({ params }: { params: Promise<{ year: string }> }) {
  const user = await requireCurrentUser();
  const { year } = await params;
  const yearNum = Number(year);
  const draft = await buildAnlageSo(user.id, yearNum, user.name ?? null);

  const fmtEur = (v: number, dec = 2) =>
    `€${v.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

  const pct = draft.total.freigrenzeEur > 0 ? Math.min(100, (draft.total.stakingIncomeEur / draft.total.freigrenzeEur) * 100) : 0;

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Anlage SO{" "}
          <span className="font-mono text-sm text-muted ml-1 tracking-wider">
            {yearNum} · §22 Nr. 3 EStG · Krypto-Staking
          </span>
        </h1>
        <div className="flex-1" />
        <a href={`/tax/${yearNum}`} className="font-mono text-[11px] text-muted hover:text-ink">
          ← Back to Anlage KAP
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <Card className="relative overflow-hidden">
          <div
            className="absolute right-[-40px] top-[-40px] w-[220px] h-[220px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(124,255,178,0.13) 0%, transparent 70%)" }}
          />
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted uppercase tracking-widest">
            <span>Tax year {draft.taxYear} · Germany</span>
            <span className="px-2 py-0.5 rounded-full bg-amber/20 text-amber text-[10px]">DRAFT</span>
          </div>
          <div className="grid grid-cols-3 gap-6 mt-3 relative">
            <div>
              <div className="font-mono text-[11px] text-dim uppercase tracking-widest">Staking income</div>
              <div className="font-bold text-[36px] num tracking-tight mt-1 text-mint">
                {fmtEur(draft.total.stakingIncomeEur)}
              </div>
              <div className="font-mono text-[11px] text-muted mt-1">{draft.total.eventCount} payouts</div>
            </div>
            <div>
              <div className="font-mono text-[11px] text-dim uppercase tracking-widest">Taxable amount</div>
              <div
                className={`font-bold text-[36px] num tracking-tight mt-1 ${
                  draft.total.freigrenzeReached ? "text-bad" : "text-mint"
                }`}
              >
                {fmtEur(draft.total.taxableEur)}
              </div>
              <div className="font-mono text-[11px] text-muted mt-1">
                {draft.total.freigrenzeReached ? "Above €256 — full sum taxable" : "Below €256 — €0 tax owed"}
              </div>
            </div>
            <div>
              <div className="font-mono text-[11px] text-dim uppercase tracking-widest">ELSTER box</div>
              <div className="font-mono text-[20px] mt-2 text-amber tracking-tight">Anlage SO · §22 Nr. 3</div>
              <div className="font-mono text-[11px] text-muted mt-1">
                {draft.total.freigrenzeReached ? "Enter full sum" : "Skip — record kept for audit"}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex justify-between items-center">
            <div className="font-semibold text-sm">Freigrenze</div>
            <div className="font-mono text-[11px] text-muted">€256 cliff</div>
          </div>
          <div className="mt-4 font-mono text-[11px] text-muted flex justify-between">
            <span>Used</span>
            <span>
              <span className="text-ink font-semibold">{fmtEur(draft.total.stakingIncomeEur, 0)}</span> of €{draft.total.freigrenzeEur}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar
              pct={pct}
              fill={draft.total.freigrenzeReached ? "var(--accent-bad, #FF5DA2)" : "var(--accent-mint, #7CFFB2)"}
              height={10}
            />
          </div>
          <div className={`mt-2 font-mono text-[11px] ${draft.total.freigrenzeReached ? "text-bad" : "text-mint"}`}>
            {draft.total.freigrenzeReached
              ? `Above threshold — file Anlage SO with the full ${fmtEur(draft.total.stakingIncomeEur, 0)}`
              : `${fmtEur(draft.total.freigrenzeEur - draft.total.stakingIncomeEur, 0)} of tax-free room remaining`}
          </div>
          <div className="mt-3 font-mono text-[10px] text-dim leading-relaxed">
            Note: the Freigrenze is shared across all §22 Nr. 3 income — staking + occasional Kleinanzeigen sales over the
            threshold + freelance gigs &lt; €256, etc. If you have any, add them before deciding.
          </div>
          <div className="flex gap-2 mt-3">
            <a
              className="bg-mint text-bg font-mono text-[11px] uppercase tracking-widest px-3 py-2.5 rounded-md font-semibold"
              href={`/tax/${yearNum}/anlage-so/export?format=pdf`}
            >
              PDF
            </a>
            <a
              className="border border-borderHard text-ink font-mono text-[11px] uppercase tracking-widest px-3 py-2.5 rounded-md font-semibold"
              href={`/tax/${yearNum}/anlage-so/export?format=csv`}
            >
              CSV
            </a>
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex justify-between items-center">
          <div className="font-semibold text-sm">Staking by coin</div>
          <div className="font-mono text-[11px] text-muted">{draft.perCoin.length} coins · {draft.total.eventCount} payouts</div>
        </div>
        <div className="grid grid-cols-[1fr_1.4fr_0.8fr_1fr_1fr] gap-0 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
          <span>Coin</span>
          <span className="text-right">Quantity</span>
          <span className="text-right">Payouts</span>
          <span className="text-right">Avg EUR/event</span>
          <span className="text-right">Total EUR</span>
        </div>
        {draft.perCoin.length === 0 && <div className="p-6 text-muted text-sm">No staking events for {yearNum}.</div>}
        {draft.perCoin.map((c) => (
          <div
            key={c.symbol}
            className="grid grid-cols-[1fr_1.4fr_0.8fr_1fr_1fr] gap-0 px-5 py-3 font-mono text-[13px] items-center border-b border-border last:border-0"
          >
            <span className="font-semibold">{c.symbol}</span>
            <span className="text-right text-muted">{c.quantity.toFixed(6)}</span>
            <span className="text-right text-muted">{c.eventCount}</span>
            <span className="text-right text-muted">{fmtEur(c.eventCount > 0 ? c.totalEur / c.eventCount : 0, 4)}</span>
            <span className="text-right font-semibold text-mint">{fmtEur(c.totalEur)}</span>
          </div>
        ))}
        {draft.perCoin.length > 0 && (
          <div className="grid grid-cols-[1fr_1.4fr_0.8fr_1fr_1fr] gap-0 px-5 py-3 bg-panel2 font-mono text-[13px] font-semibold border-t border-borderHard">
            <span className="col-span-4 font-mono text-[10px] text-muted uppercase tracking-widest">Σ Total</span>
            <span className="text-right text-mint">{fmtEur(draft.total.stakingIncomeEur)}</span>
          </div>
        )}
      </Card>

      <div className="flex gap-2 font-mono text-[11px] text-dim">
        <span>ℹ</span>
        <span>
          Each payout valued in EUR at receipt using ECB daily reference rates (USD → EUR). §23 EStG private sale gains
          (held &lt;1 year, then sold) are not included — Phase 2. Confirm with your Steuerberater before filing.
        </span>
      </div>
    </main>
  );
}
