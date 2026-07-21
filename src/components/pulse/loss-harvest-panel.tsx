"use client";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "./card";
import { fmtEur } from "@/lib/format";
import {
  bucketOverages,
  encodeSellParams,
  suggestedSharesToZero,
  type HarvestCandidate,
  type HarvestInputs,
  type HarvestResult,
  type SellInstruction,
} from "@/lib/tax/loss-harvest";

function brokerChip(broker: string): string {
  const norm = broker.toUpperCase();
  if (norm === "FF" || norm.startsWith("FREEDOM")) return "bg-brand-freedom/15 text-brand-freedom border border-brand-freedom/30";
  if (norm === "IBKR") return "bg-brand-ibkr/15 text-brand-ibkr border border-brand-ibkr/30";
  return "bg-panel2 text-muted";
}

function avatarLabel(symbol: string, name: string | undefined): string {
  if (symbol.length >= 2) return symbol.slice(0, 2);
  if (name) {
    const parts = name.replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  }
  return symbol;
}

type Props = {
  year: number;
  candidates: HarvestCandidate[];
  sells: SellInstruction[];
  result: HarvestResult;
  optimum: SellInstruction[];
  inputs: HarvestInputs;
  forecastDaysRemaining: number;
};

export function LossHarvestPanel({
  year,
  candidates,
  sells,
  result,
  optimum,
  inputs,
  forecastDaysRemaining,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // useTransition lets the RSC refetch run in the background without
  // blocking the UI thread. isPending drives the "Updating…" indicator.
  const [isPending, startTransition] = useTransition();

  // Optimistic mirror of the server-derived `sells` prop. Click handlers
  // mutate this immediately so the stepper reacts on first frame; the
  // useEffect resyncs once the RSC payload arrives. Without this, the
  // stepper state lags behind the click by an entire round-trip and the
  // UI looks unresponsive.
  const [optimisticSells, setOptimisticSells] = useState<SellInstruction[]>(sells);
  useEffect(() => {
    setOptimisticSells(sells);
  }, [sells]);

  // Selection state lives in ?sell=… so it's shareable and survives reload.
  // The URL update is wrapped in startTransition so it doesn't block input;
  // optimisticSells covers the visual gap until the new server props arrive.
  const updateUrl = useCallback((next: SellInstruction[]) => {
    setOptimisticSells(next);
    const usp = new URLSearchParams(searchParams.toString());
    const encoded = encodeSellParams(next);
    if (encoded) usp.set("sell", encoded);
    else usp.delete("sell");
    startTransition(() => {
      router.replace(`/tax/${year}/loss-harvest${usp.toString() ? `?${usp.toString()}` : ""}` as never, { scroll: false });
    });
  }, [searchParams, router, year]);

  const sellByKey = useMemo(() => {
    const m = new Map<string, SellInstruction>();
    for (const s of optimisticSells) m.set(`${s.candidate.symbol}.${s.candidate.broker}`, s);
    return m;
  }, [optimisticSells]);

  const setQty = useCallback((c: HarvestCandidate, qty: number) => {
    const key = `${c.symbol}.${c.broker}`;
    const clamped = Math.max(0, Math.min(c.qty, Number.isFinite(qty) ? qty : 0));
    const next = optimisticSells
      .filter((s) => `${s.candidate.symbol}.${s.candidate.broker}` !== key)
      .concat(clamped > 0 ? [{ candidate: c, qtyToSell: clamped, realisedLossEur: c.lossPerShareEur * clamped }] : []);
    updateUrl(next);
  }, [optimisticSells, updateUrl]);

  const applyOptimum = useCallback(() => updateUrl(optimum), [optimum, updateUrl]);
  const clearAll = useCallback(() => updateUrl([]), [updateUrl]);

  const aktienCands = candidates.filter((c) => c.bucket === "aktien");
  const sonstigeCands = candidates.filter((c) => c.bucket === "sonstige");
  const hasSonstigeSell = optimisticSells.some((s) => s.candidate.bucket === "sonstige");

  const currentTaxableBase = Math.max(
    0,
    Math.max(0, inputs.aktien.totalIncomeEur) + Math.max(0, inputs.sonstige.totalIncomeEur) - inputs.allowanceEur,
  );

  // Per-bucket overage remaining after the user's current sells.
  // Drives the live per-row "shares to zero remaining overage" hint.
  const overages = useMemo(() => bucketOverages(inputs, optimisticSells), [inputs, optimisticSells]);
  const aktienHasCandidatesButNoOverage =
    aktienCands.length > 0 && overages.aktien <= 0;
  const sonstigeHasCandidatesButNoOverage =
    sonstigeCands.length > 0 && overages.sonstige <= 0;

  // Sum of each bucket's OWN candidate rows' full unrealisedLossEur — pure
  // display aggregation over already-computed HarvestCandidate fields
  // (buildCandidates()), not a new loss calculation.
  const aktienCandLossSum = aktienCands.reduce((s, c) => s + c.unrealisedLossEur, 0);
  const sonstigeCandLossSum = sonstigeCands.reduce((s, c) => s + c.unrealisedLossEur, 0);
  const totalSharesSelected = optimisticSells.reduce((s, x) => s + x.qtyToSell, 0);

  const aktienSubtitle = overages.aktien > 0
    ? `${fmtEur(overages.aktien)} of Aktien overage to cover · gross €${inputs.aktien.totalIncomeEur.toFixed(0)}`
    : `Aktien bucket has no overage to cover · losses here carry forward to next year`;
  const sonstigeSubtitle = overages.sonstige > 0
    ? `${fmtEur(overages.sonstige)} of Sonstige overage to cover · gross €${inputs.sonstige.totalIncomeEur.toFixed(0)} incl. forecast`
    : `Sonstige bucket already inside the Pauschbetrag`;

  return (
    <div className="space-y-4">
      <DisclaimerBanner />

      <RecommendationCard
        overages={overages}
        aktienGross={inputs.aktien.totalIncomeEur}
        sonstigeGross={inputs.sonstige.totalIncomeEur}
        allowanceEur={inputs.allowanceEur}
        aktienOnlyCandidates={aktienHasCandidatesButNoOverage && sonstigeCands.length === 0}
        sonstigeOnlyCandidates={sonstigeHasCandidatesButNoOverage && aktienCands.length === 0}
        estTaxSavedEur={result.estTaxSavedEur}
        aktienCandLossSum={aktienCandLossSum}
        sonstigeCandLossSum={sonstigeCandLossSum}
      />

      {/* Per-bucket net + combined taxable base. While the RSC refetch is in
          flight after a click, the optimisticSells already reflects the new
          selection but these numbers are still last-frame's — fade slightly
          so the user knows fresh totals are loading. */}
      <Card className="rounded-[24px] p-[22px] sm:p-[26px]">
        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 transition-opacity duration-150 ${isPending ? "opacity-60" : "opacity-100"}`}>
          <BucketTile
            label="Aktien bucket"
            value={fmtEur(result.aktienNetEur)}
            sub={
              inputs.aktien.totalIncomeEur < 0
                ? `${fmtEur(-inputs.aktien.totalIncomeEur)} of stock losses carry forward to next year`
                : overages.aktien > 0
                  ? `${fmtEur(overages.aktien)} over the cap — sell Aktien losers to reduce`
                  : `Already inside the Pauschbetrag for this bucket`
            }
            help="Individual-stock income net of selected stock losses. §20 Abs. 6 EStG: floored at €0 — losses here cannot offset the Sonstige bucket."
          />
          <BucketTile
            label="Sonstige bucket"
            value={fmtEur(result.sonstigeNetEur)}
            sub={
              overages.sonstige > 0
                ? `${fmtEur(overages.sonstige)} over the cap — sell Sonstige losers to reduce`
                : `Already inside the Pauschbetrag for this bucket`
            }
            help="ETFs, bonds, dividends, interest. Forecast dividends included. §20 Abs. 6 EStG: floored at €0 — losses here cannot offset the Aktien bucket."
          />
          <BucketTile
            label="Taxable base"
            value={fmtEur(result.taxableBaseEur)}
            sub={
              result.taxableBaseEur === 0
                ? `At or under the €${inputs.allowanceEur.toLocaleString("de-DE")} Pauschbetrag`
                : `${fmtEur(result.taxableBaseEur)} above the €${inputs.allowanceEur.toLocaleString("de-DE")} Pauschbetrag${result.taxableBaseEur < currentTaxableBase ? ` · was ${fmtEur(currentTaxableBase)}` : ""}`
            }
            highlight={result.taxableBaseEur < currentTaxableBase ? "mint" : undefined}
            help="Net capital income above the Sparer-Pauschbetrag — taxed at 26.375% (Abgeltungsteuer + Soli)."
          />
        </div>
      </Card>

      <Card className="rounded-[24px] p-[22px] sm:p-[30px]">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <div className="text-[17px] font-semibold">Simulate a harvest</div>
            <div className="text-[13px] text-muted mt-1">Choose how many shares to sell and watch the effect on your tax, live.</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isPending && (
              <span
                className="inline-flex items-center gap-1.5 font-mono text-[11px] text-mint"
                title="Recomputing totals after your last change"
              >
                <Spinner />
                <span>Updating…</span>
              </span>
            )}
            <button
              type="button"
              onClick={applyOptimum}
              disabled={optimum.length === 0}
              className="bg-mint text-bg font-mono text-[11px] uppercase tracking-widest px-4 py-2 rounded-lg font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
              title={optimum.length === 0 ? "Already inside the Pauschbetrag — no harvest needed." : `Apply ${optimum.length} suggested sell${optimum.length === 1 ? "" : "s"}.`}
            >
              Auto-pick optimum
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={optimisticSells.length === 0}
              className="border border-borderHard text-ink font-mono text-[11px] uppercase tracking-widest px-4 py-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          </div>
        </div>

        {/* live summary tiles */}
        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 transition-opacity duration-150 ${isPending ? "opacity-60" : "opacity-100"}`}>
          <StatTile label="Shares selected" value={String(totalSharesSelected)} />
          <StatTile
            label="Loss realized"
            value={fmtEur(result.totalLossRealisedEur)}
            tone={result.totalLossRealisedEur < 0 ? "bad" : undefined}
          />
          <StatTile
            label="Tax saved this year"
            value={fmtEur(result.estTaxSavedEur)}
            tone={result.estTaxSavedEur > 0 ? "mint" : undefined}
            sub={
              result.estTaxSavedEur > 0
                ? `vs. doing nothing · ${forecastDaysRemaining > 0 ? `${forecastDaysRemaining}d to Dec 31` : "end of year"}`
                : forecastDaysRemaining > 0
                  ? `Select losses to see savings · ${forecastDaysRemaining}d to Dec 31`
                  : `End of tax year reached`
            }
            help="Estimated tax saved vs. the current 'do nothing' baseline. Excludes Kirchensteuer."
          />
        </div>
        <div className="mt-2 font-mono text-[11px] text-muted">
          {optimisticSells.length} of {candidates.length} position{candidates.length === 1 ? "" : "s"} selected
        </div>

        {optimisticSells.length > 0 && (
          <div className="mt-4">
            <WashSaleWarning />
          </div>
        )}
        {hasSonstigeSell && (
          <div className="mt-3">
            <TeilfreistellungNote />
          </div>
        )}

        <HarvestBucketSection
          label="Individual stocks · Aktien"
          subtitle={aktienSubtitle}
          candidates={aktienCands}
          sellByKey={sellByKey}
          bucketOverage={overages.aktien}
          onSetQty={setQty}
        />
        <HarvestBucketSection
          label="Funds & ETFs, dividends, interest · Sonstige"
          subtitle={sonstigeSubtitle}
          candidates={sonstigeCands}
          sellByKey={sellByKey}
          bucketOverage={overages.sonstige}
          onSetQty={setQty}
        />
      </Card>

      <ExplainerCallout />

      <BucketSplitFootnote />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Top recommendation card — mirrors the mockup's hero-style "No action
 * needed" / warning treatment. Branch conditions and copy are lifted
 * byte-identical from the previous `BucketSituation` component; only the
 * JSX wrapper (icon + headline/body split + optional stat tiles) changed.
 * Do not reword the §20 Abs. 6 sentences below.
 */
function RecommendationCard({
  overages,
  aktienGross,
  sonstigeGross,
  allowanceEur,
  aktienOnlyCandidates,
  sonstigeOnlyCandidates,
  estTaxSavedEur,
  aktienCandLossSum,
  sonstigeCandLossSum,
}: {
  overages: { aktien: number; sonstige: number };
  aktienGross: number;
  sonstigeGross: number;
  allowanceEur: number;
  aktienOnlyCandidates: boolean;
  sonstigeOnlyCandidates: boolean;
  estTaxSavedEur: number;
  aktienCandLossSum: number;
  sonstigeCandLossSum: number;
}) {
  const totalOverage = overages.aktien + overages.sonstige;

  if (totalOverage <= 0) {
    return (
      <Card className="rounded-[24px] p-[24px] sm:p-[34px] border-mint/25">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-mint/15 text-mint inline-flex items-center justify-center text-lg shrink-0">✓</span>
          <div className="text-xl sm:text-2xl font-bold tracking-tight">
            You&apos;re already inside the €{allowanceEur.toLocaleString("de-DE")} Pauschbetrag.
          </div>
        </div>
        <div className="mt-3 text-[15px] text-muted leading-relaxed max-w-[640px]">
          Aktien net €{aktienGross.toFixed(0)} · Sonstige net €{sonstigeGross.toFixed(0)} · no harvest needed.
        </div>
        <div className="flex gap-3 mt-6 flex-wrap">
          <StatTile label="Tax saved this year" value={fmtEur(estTaxSavedEur)} tone={estTaxSavedEur > 0 ? "mint" : undefined} />
        </div>
      </Card>
    );
  }

  // The pathological case: overage lives entirely in a bucket where the user
  // has no loss candidates. Selling won't help this year.
  if (aktienOnlyCandidates && overages.sonstige > 0 && overages.aktien <= 0) {
    return (
      <Card className="rounded-[24px] p-[24px] sm:p-[34px] border-amber/25">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-amber/15 text-amber inline-flex items-center justify-center text-lg shrink-0">⚠</span>
          <div className="text-xl sm:text-2xl font-bold tracking-tight">
            Your overage (€{overages.sonstige.toFixed(0)}) is in the Sonstige bucket, but all your loss candidates are Aktien.
          </div>
        </div>
        <div className="mt-3 text-[15px] text-muted leading-relaxed max-w-[660px]">
          Under §20 Abs. 6 EStG, stock losses cannot offset dividend/ETF income — selling them now would just carry the
          losses forward to next year as Aktien-only losses, with <em>no impact</em> on this year&apos;s taxable base.
        </div>
        <div className="flex gap-3 mt-6 flex-wrap">
          <StatTile label="Tax saved this year" value={fmtEur(estTaxSavedEur)} />
          <StatTile label="Losses that could carry forward" value={fmtEur(aktienCandLossSum)} tone="bad" />
        </div>
      </Card>
    );
  }
  if (sonstigeOnlyCandidates && overages.aktien > 0 && overages.sonstige <= 0) {
    return (
      <Card className="rounded-[24px] p-[24px] sm:p-[34px] border-amber/25">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-amber/15 text-amber inline-flex items-center justify-center text-lg shrink-0">⚠</span>
          <div className="text-xl sm:text-2xl font-bold tracking-tight">
            Your overage (€{overages.aktien.toFixed(0)}) is in the Aktien bucket, but all your loss candidates are Sonstige.
          </div>
        </div>
        <div className="mt-3 text-[15px] text-muted leading-relaxed max-w-[660px]">
          §20 Abs. 6 EStG: those losses can&apos;t offset stock gains — they&apos;d carry forward instead.
        </div>
        <div className="flex gap-3 mt-6 flex-wrap">
          <StatTile label="Tax saved this year" value={fmtEur(estTaxSavedEur)} />
          <StatTile label="Losses that could carry forward" value={fmtEur(sonstigeCandLossSum)} tone="bad" />
        </div>
      </Card>
    );
  }

  // Normal case: at least one bucket has both overage AND candidates.
  // When BOTH buckets have positive overage, the per-bucket numbers are NOT
  // additive — each represents how much that bucket alone could absorb
  // to zero the same shared taxable base. Spell that out so the user
  // doesn't think they need to harvest both sums.
  if (overages.aktien > 0 && overages.sonstige > 0) {
    const smaller = Math.min(overages.aktien, overages.sonstige);
    return (
      <Card className="rounded-[24px] p-[22px] sm:p-[26px]">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-panel2 text-ink inline-flex items-center justify-center text-lg shrink-0">→</span>
          <div className="text-lg font-bold tracking-tight">Overage to cover: €{smaller.toFixed(0)}</div>
        </div>
        <div className="mt-2 text-[12px] text-dim">(taxable base — the single shared figure, not summed across buckets)</div>
        <div className="mt-3 text-[14px] text-muted leading-relaxed max-w-[660px]">
          Either bucket alone can zero it — Aktien losses absorb up to €{overages.aktien.toFixed(0)}, Sonstige up to
          €{overages.sonstige.toFixed(0)}. Pick whichever bucket you have better losers in. Each candidate row below
          has a quick-fill control showing how many shares of that position would do it on its own.
        </div>
      </Card>
    );
  }
  const parts: string[] = [];
  if (overages.aktien > 0) parts.push(`€${overages.aktien.toFixed(0)} Aktien`);
  if (overages.sonstige > 0) parts.push(`€${overages.sonstige.toFixed(0)} Sonstige`);
  return (
    <Card className="rounded-[24px] p-[22px] sm:p-[26px]">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-panel2 text-ink inline-flex items-center justify-center text-lg shrink-0">→</span>
        <div className="text-lg font-bold tracking-tight">Overage to cover: {parts.join(" · ")}</div>
      </div>
      <div className="mt-3 text-[14px] text-muted leading-relaxed max-w-[660px]">
        Sell losers in the matching bucket to reduce taxable base — each candidate row below has a quick-fill
        control showing how many shares would do it.
      </div>
    </Card>
  );
}

function Spinner() {
  // 10×10 inline SVG so we don't pull a heavier icon lib for one usage.
  // Stays in flow next to the "Updating…" text so it never causes layout shift.
  return (
    <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function DisclaimerBanner() {
  return (
    <div className="font-mono text-[11px] text-amber bg-amber/10 border border-amber/25 rounded-xl px-4 py-3">
      <strong>Estimation only — not tax advice.</strong> Bucket attribution (Aktien vs Sonstige) follows §20 Abs. 6 EStG to the best
      of our data. For material amounts, consult a Steuerberater before acting.
    </div>
  );
}

function WashSaleWarning() {
  return (
    <div className="font-mono text-[11px] text-amber bg-amber/10 border border-amber/25 rounded-xl px-4 py-3">
      <strong>§ 42 AO reminder:</strong> Germany has no formal wash-sale rule, but repurchasing the same ISIN within ~24 h
      may be challenged as Gestaltungsmissbrauch. Wait a trading day before rebuying — or rebuy a similar-but-different
      instrument (e.g. SXR8 in place of VUSA).
    </div>
  );
}

function TeilfreistellungNote() {
  return (
    <div className="font-mono text-[10px] text-dim border-l-2 border-dim/40 pl-2">
      ETF/Aktienfonds positions: only 70% of the loss counts under InvStG §20 Abs. 1 Nr. 3 (Teilfreistellung). The
      figures above are pre-adjustment — your broker will apply the haircut at sale time.
    </div>
  );
}

function BucketSplitFootnote() {
  return (
    <div className="font-mono text-[10px] text-dim">
      Realised gains are split per match using the same Aktien/ETF/Bond classifier as the positions table. Dividends and
      interest go to Sonstige. Mis-classified instruments (e.g. an exotic certificate) will land in the wrong bucket — flag any
      surprises and we&apos;ll update the kind map.
    </div>
  );
}

/** Static explainer callout — generic education, not per-user tax figures. */
function ExplainerCallout() {
  return (
    <div className="bg-panel2 border border-border rounded-[18px] px-5 py-4 sm:px-6 sm:py-5 flex gap-3">
      <span className="text-mint text-base leading-none shrink-0">💡</span>
      <div className="text-[13px] text-muted leading-relaxed">
        <strong className="text-ink">When would harvesting help?</strong> Selling a loser only lowers this year&apos;s tax when
        it sits in the bucket that&apos;s over the Pauschbetrag — an Aktien loss only offsets Aktien gains, a Sonstige loss
        (ETFs, funds, dividends, interest) only offsets Sonstige income (§20 Abs. 6 EStG). Outside that, the loss isn&apos;t
        wasted — it becomes a Verlustvortrag and carries forward to next year.
      </div>
    </div>
  );
}

function BucketTile({
  label,
  value,
  sub,
  help,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  help: string;
  highlight?: "mint";
}) {
  return (
    <div className="bg-panel2 rounded-2xl p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-dim cursor-help" title={help}>
        {label}&nbsp;ⓘ
      </div>
      <div className={`text-xl font-bold mt-1.5 num ${highlight === "mint" ? "text-mint" : "text-ink"}`}>{value}</div>
      <div className="font-mono text-[10px] text-muted mt-1">{sub}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  help,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  help?: string;
  tone?: "mint" | "amber" | "bad";
}) {
  const toneClass = tone === "mint" ? "text-mint" : tone === "amber" ? "text-amber" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div className="bg-panel2 border border-border rounded-2xl px-4 py-3 min-w-[140px] flex-1">
      <div className={`font-mono text-[10px] uppercase tracking-widest text-dim ${help ? "cursor-help" : ""}`} title={help}>
        {label}
        {help ? " ⓘ" : ""}
      </div>
      <div className={`text-xl font-bold mt-1.5 num ${toneClass}`}>{value}</div>
      {sub && <div className="font-mono text-[10px] text-muted mt-1">{sub}</div>}
    </div>
  );
}

/**
 * Single harvest candidate row — a +/− stepper (0..c.qty) driving the
 * server-derived selection directly via `onSetQty`. Every click calls
 * `setQty`, which is the SAME function that previously backed the checkbox
 * + free-text-qty combo: it clamps, builds the next `SellInstruction[]`,
 * and hands off to `updateUrl` (?sell= round-trip + router.replace inside
 * a transition). No new selection pathway — just a different control
 * surface over the identical state transition.
 */
function CandidateRow({
  c,
  sel,
  bucketOverage,
  onSetQty,
}: {
  c: HarvestCandidate;
  sel: SellInstruction | undefined;
  /** Remaining overage in THIS row's bucket. Drives the per-row suggestion. */
  bucketOverage: number;
  onSetQty: (c: HarvestCandidate, qty: number) => void;
}) {
  const qty = sel?.qtyToSell ?? 0;
  const max = c.qty;
  const selected = qty > 0;
  const rowLossEur = selected ? c.lossPerShareEur * qty : 0;

  // Bucket-aware suggestion: whole shares of THIS position that would zero
  // the remaining overage in this row's bucket. Returns null when the
  // bucket already fits inside the Pauschbetrag (i.e. selling this row
  // wouldn't reduce taxable base — only carry the loss forward).
  const suggested = suggestedSharesToZero(c, c.bucket === "aktien" ? { aktien: bucketOverage, sonstige: 0 } : { aktien: 0, sonstige: bucketOverage });

  const priceInfo = `Avg cost €${c.avgCostEur.toFixed(2)} · current €${c.pricePerUnitEur.toFixed(2)}${
    c.qty < c.positionQty
      ? ` · harvest cap: selling more than ${c.qty} of the ${c.positionQty} held starts consuming cheaper (profitable) lots and erodes the loss.`
      : ""
  }`;

  return (
    <div
      className={`flex flex-wrap sm:flex-nowrap items-center gap-3.5 px-3 sm:px-4 py-3.5 ${selected ? "bg-bad/5" : ""}`}
    >
      <span
        className="w-9 h-9 rounded-xl bg-panel2 text-muted inline-flex items-center justify-center font-mono text-[11px] font-bold shrink-0 cursor-help"
        title={priceInfo}
      >
        {avatarLabel(c.symbol, c.name)}
      </span>

      <div className="flex-1 min-w-[140px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-semibold">{c.symbol}</span>
          <span className={`font-mono text-[10px] tracking-wider px-1.5 py-0.5 rounded ${brokerChip(c.broker)}`}>{c.broker}</span>
          {c.hiddenLoss && (
            <span
              className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber/10 text-amber cursor-help"
              title={`Position is ${c.positionPlEur !== null && c.positionPlEur >= 0 ? "+" : ""}€${(c.positionPlEur ?? 0).toFixed(2)} overall, but under FIFO (§20 Abs. 4 EStG) a sale consumes the OLDEST lots first — and the first ${c.qty} share${c.qty === 1 ? "" : "s"} sit above the current price. Selling exactly ${c.qty} realises ${fmtEur(c.unrealisedLossEur)} of loss while keeping the cheaper, profitable lots.`}
            >
              FIFO
            </span>
          )}
        </div>
        <div className="text-[12px] text-muted truncate mt-0.5">
          {c.name ?? (c.bucket === "aktien" ? "Individual stock · Aktien" : "Fund / income · Sonstige")}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onSetQty(c, Math.max(0, qty - 1))}
          disabled={qty <= 0}
          aria-label={`Sell one fewer share of ${c.symbol}`}
          className="w-8 h-8 rounded-lg border border-borderHard bg-panel2 text-ink font-mono text-base leading-none disabled:opacity-25 disabled:cursor-not-allowed"
        >
          −
        </button>
        <div className="text-center min-w-[52px]">
          <div className="font-mono text-sm font-bold num">{qty}</div>
          <div className="font-mono text-[10px] text-dim">of {max}</div>
        </div>
        <button
          type="button"
          onClick={() => onSetQty(c, Math.min(max, qty + 1))}
          disabled={qty >= max}
          aria-label={`Sell one more share of ${c.symbol}`}
          className="w-8 h-8 rounded-lg border border-borderHard bg-panel2 text-ink font-mono text-base leading-none disabled:opacity-25 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>

      <div className="text-right w-[92px] shrink-0">
        <div className={`font-mono text-sm font-semibold num ${selected ? "text-bad" : "text-dim"}`}>
          {selected ? fmtEur(rowLossEur) : "—"}
        </div>
        <div className="font-mono text-[10px] text-dim num">{fmtEur(c.lossPerShareEur)}/sh</div>
      </div>

      <div className="w-[76px] text-right shrink-0 hidden sm:block">
        {suggested === null ? (
          <span
            className="font-mono text-[10px] text-dim cursor-help"
            title={
              c.bucket === "aktien"
                ? "Aktien bucket has no overage to cover — selling this loss would carry forward to next year, not reduce this year's taxable base."
                : "Sonstige bucket has no overage to cover — selling this loss would carry forward to next year, not reduce this year's taxable base."
            }
          >—</span>
        ) : (
          <button
            type="button"
            onClick={() => onSetQty(c, suggested)}
            title={`Fill ${suggested} share${suggested === 1 ? "" : "s"} — zeros this bucket's remaining overage`}
            className="font-mono text-[10px] px-2 py-1 rounded border border-mint/30 bg-mint/10 text-mint hover:bg-mint/20 cursor-pointer transition-colors"
          >
            → {suggested}
          </button>
        )}
      </div>
    </div>
  );
}

function HarvestBucketSection({
  label,
  subtitle,
  candidates,
  sellByKey,
  bucketOverage,
  onSetQty,
}: {
  label: string;
  subtitle: string;
  candidates: HarvestCandidate[];
  sellByKey: Map<string, SellInstruction>;
  /** Remaining overage in this bucket (already nets out user's sells in this bucket). */
  bucketOverage: number;
  onSetQty: (c: HarvestCandidate, qty: number) => void;
}) {
  return (
    <div className="mt-7">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted">{label}</div>
          <div className="text-[12px] text-dim mt-1">{subtitle}</div>
        </div>
        <div className="font-mono text-[11px] text-dim shrink-0">
          {candidates.length} holding{candidates.length === 1 ? "" : "s"}
        </div>
      </div>
      <div className="mt-3">
        {candidates.length === 0 ? (
          <div className="bg-panel2 border border-dashed border-border rounded-2xl px-5 py-4 flex gap-3">
            <span className="text-mint text-sm shrink-0">↳</span>
            <div className="text-[13px] text-muted leading-relaxed">No unrealised losses in this bucket.</div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {candidates.map((c) => (
              <CandidateRow
                key={`${c.symbol}.${c.broker}`}
                c={c}
                sel={sellByKey.get(`${c.symbol}.${c.broker}`)}
                bucketOverage={bucketOverage}
                onSetQty={onSetQty}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
