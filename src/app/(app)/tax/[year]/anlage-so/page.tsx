import { requireCurrentUser } from "@/lib/auth/server";
import { buildAnlageSo } from "@/lib/tax/anlage-so";
import { Card } from "@/components/pulse/card";
import { ProgressBar } from "@/components/pulse/progress-bar";
import { MetricsGrid } from "@/components/pulse/metrics-grid";
import { Section23Table } from "@/components/pulse/section23-table";
import { StakingPerCoinTable } from "@/components/pulse/staking-per-coin-table";
import { fmtEur } from "@/lib/format";

type SP = Promise<{ page?: string }>;

export default async function AnlageSoPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: SP;
}) {
  const user = await requireCurrentUser();
  const { year } = await params;
  const yearNum = Number(year);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const draft = await buildAnlageSo(user.id, yearNum, user.name ?? null);

  const s22 = draft.total.section22;
  const s23 = draft.total.section23;
  const s22Pct = s22.freigrenzeEur > 0 ? Math.min(100, (s22.stakingIncomeEur / s22.freigrenzeEur) * 100) : 0;
  const s23Pct = s23.freigrenzeEur > 0 ? Math.min(100, (Math.max(0, s23.shortTermNetGainEur) / s23.freigrenzeEur) * 100) : 0;
  const anyTaxable = draft.total.totalTaxableEur > 0;

  return (
    <main className="space-y-4">
      <div className="space-y-2">
        <a href={`/tax/${yearNum}`} className="font-mono text-[11px] text-muted hover:text-ink inline-block">
          ← Back to Tax
        </a>
        <h1 className="text-2xl font-bold tracking-tight">
          Anlage SO
          <span className="font-mono text-sm text-muted ml-2 tracking-wider block lg:inline">
            {yearNum} · §22 Nr. 3 EStG · Krypto-Staking
          </span>
        </h1>
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
          <div className="mt-4 relative">
            <MetricsGrid
              columns={4}
              metrics={[
                {
                  label: "§22 Staking",
                  value: fmtEur(s22.stakingIncomeEur),
                  subline: `${s22.eventCount} payouts · €${s22.freigrenzeEur} cliff`,
                  accent: s22.freigrenzeReached ? "bad" : "mint",
                  valueSize: "lg",
                },
                {
                  label: "§23 Short-term",
                  value: fmtEur(s23.shortTermNetGainEur, { sign: s23.shortTermNetGainEur !== 0 }),
                  subline: s23.matchCount === 0
                    ? "no sales"
                    : `${s23.matchCount} match${s23.matchCount === 1 ? "" : "es"} · €${s23.freigrenzeEur} cliff`,
                  accent: "auto",
                  sign: s23.shortTermNetGainEur,
                  valueSize: "lg",
                },
                {
                  label: "Taxable total",
                  value: fmtEur(draft.total.totalTaxableEur),
                  subline: anyTaxable
                    ? "§22 + §23 (separate lines)"
                    : "Both below cliff — €0 owed",
                  accent: anyTaxable ? "bad" : "mint",
                  valueSize: "lg",
                },
                {
                  label: "ELSTER box",
                  value: "Anlage SO",
                  subline: anyTaxable
                    ? "Enter sums above"
                    : "Skip — record kept for audit",
                  accent: "amber",
                  valueSize: "lg",
                },
              ]}
            />
          </div>
        </Card>

        <Card>
          <div className="flex justify-between items-center">
            <div className="font-semibold text-sm">Freigrenzen</div>
            <div className="font-mono text-[11px] text-muted">two separate cliffs</div>
          </div>

          {/* §22 Nr. 3 — €256 cliff on staking income alone */}
          <div className="mt-4 font-mono text-[11px] text-muted flex justify-between">
            <span>§22 Nr. 3 staking</span>
            <span>
              <span className="text-ink font-semibold">{fmtEur(s22.stakingIncomeEur, { dec: 0 })}</span> of €{s22.freigrenzeEur}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar
              pct={s22Pct}
              fill={s22.freigrenzeReached ? "var(--accent-bad, #FF5DA2)" : "var(--accent-mint, #7CFFB2)"}
              height={10}
            />
          </div>
          <div className={`mt-1 font-mono text-[11px] ${s22.freigrenzeReached ? "text-bad" : "text-mint"}`}>
            {s22.freigrenzeReached
              ? `Above — file the full ${fmtEur(s22.stakingIncomeEur, { dec: 0 })}`
              : `${fmtEur(s22.freigrenzeEur - s22.stakingIncomeEur, { dec: 0 })} tax-free room left`}
          </div>

          {/* §23 — €600/€1000 cliff on net short-term sale gains */}
          <div className="mt-4 font-mono text-[11px] text-muted flex justify-between">
            <span>§23 private sales</span>
            <span>
              <span className="text-ink font-semibold">{fmtEur(s23.shortTermNetGainEur, { dec: 0, sign: s23.shortTermNetGainEur !== 0 })}</span> of €{s23.freigrenzeEur}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar
              pct={s23Pct}
              fill={s23.freigrenzeReached ? "var(--accent-bad, #FF5DA2)" : "var(--accent-mint, #7CFFB2)"}
              height={10}
            />
          </div>
          <div className={`mt-1 font-mono text-[11px] ${s23.freigrenzeReached ? "text-bad" : "text-mint"}`}>
            {s23.lossCarryforwardEur > 0
              ? `Net loss ${fmtEur(s23.lossCarryforwardEur, { dec: 0 })} — carries forward (§23 only)`
              : s23.freigrenzeReached
                ? `Above — file the full ${fmtEur(s23.shortTermNetGainEur, { dec: 0 })}`
                : `${fmtEur(s23.freigrenzeEur - Math.max(0, s23.shortTermNetGainEur), { dec: 0 })} tax-free room left`}
          </div>

          <div className="mt-3 font-mono text-[10px] text-dim leading-relaxed">
            Note: the two Freigrenzen are independent. §22 (€256) covers all your sonstige Leistungen (staking + e.g.
            occasional Kleinanzeigen sales); §23 (€{s23.freigrenzeEur}) covers all private-sale gains. A §23 loss does
            not lower §22 income.
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <a
              className="bg-mint text-bg font-mono text-[11px] uppercase tracking-widest px-4 py-2.5 rounded-md font-semibold"
              href={`/tax/${yearNum}/anlage-so/export?format=pdf`}
            >
              Export PDF · Anlage SO
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

      <StakingPerCoinTable
        rows={draft.perCoin}
        year={yearNum}
        totalEur={s22.stakingIncomeEur}
      />

      <Section23Table
        matches={draft.section23Matches}
        page={page}
        basePath={`/tax/${yearNum}/anlage-so`}
      />

      <div className="flex gap-2 font-mono text-[11px] text-dim">
        <span>ℹ</span>
        <span>
          §22 staking income valued in EUR at receipt using ECB daily reference rates (USD → EUR). §23 matches use
          FIFO against opened lots from buys + staking rewards. Confirm with your Steuerberater before filing.
        </span>
      </div>
    </main>
  );
}
