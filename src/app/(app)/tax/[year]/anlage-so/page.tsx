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

  const combinedBaseEur = draft.total.stakingIncomeEur + draft.total.section23ShortTermGainEur;
  const pct = draft.total.freigrenzeEur > 0 ? Math.min(100, (combinedBaseEur / draft.total.freigrenzeEur) * 100) : 0;

  return (
    <main className="space-y-4">
      <div className="space-y-2">
        <a href={`/tax/${yearNum}`} className="font-mono text-[11px] text-muted hover:text-ink inline-block">
          ← Back to Anlage KAP
        </a>
        <h1 className="text-2xl font-bold tracking-tight">
          Anlage SO{" "}
          <span className="font-mono text-sm text-muted ml-1 tracking-wider block lg:inline">
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
                  value: fmtEur(draft.total.stakingIncomeEur),
                  subline: `${draft.total.eventCount} payouts`,
                  accent: "mint",
                  valueSize: "lg",
                },
                {
                  label: "§23 Short-term",
                  value: fmtEur(draft.total.section23ShortTermGainEur, { sign: draft.total.section23ShortTermGainEur !== 0 }),
                  subline: draft.total.section23MatchCount === 0
                    ? "no sales"
                    : `${draft.total.section23MatchCount} match${draft.total.section23MatchCount === 1 ? "" : "es"}`,
                  accent: "auto",
                  sign: draft.total.section23ShortTermGainEur,
                  valueSize: "lg",
                },
                {
                  label: "Taxable amount",
                  value: fmtEur(draft.total.taxableEur),
                  subline: draft.total.freigrenzeReached
                    ? "Above €256 — full sum taxable"
                    : "Below €256 — €0 tax owed",
                  accent: draft.total.freigrenzeReached ? "bad" : "mint",
                  valueSize: "lg",
                },
                {
                  label: "ELSTER box",
                  value: "Anlage SO",
                  subline: draft.total.freigrenzeReached
                    ? "Enter sums above · §22 Nr. 3 + §23"
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
            <div className="font-semibold text-sm">Freigrenze</div>
            <div className="font-mono text-[11px] text-muted">€256 cliff</div>
          </div>
          <div className="mt-4 font-mono text-[11px] text-muted flex justify-between">
            <span>Used</span>
            <span>
              <span className="text-ink font-semibold">{fmtEur(combinedBaseEur, { dec: 0 })}</span> of €{draft.total.freigrenzeEur}
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
              ? `Above threshold — file Anlage SO with the full ${fmtEur(combinedBaseEur, { dec: 0 })}`
              : `${fmtEur(draft.total.freigrenzeEur - combinedBaseEur, { dec: 0 })} of tax-free room remaining`}
          </div>
          <div className="mt-3 font-mono text-[10px] text-dim leading-relaxed">
            Note: the Freigrenze is shared across all §22 Nr. 3 income — staking + occasional Kleinanzeigen sales over the
            threshold + freelance gigs &lt; €256, etc. If you have any, add them before deciding.
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
        totalEur={draft.total.stakingIncomeEur}
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
