"use client";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "./card";
import {
  bucketOverages,
  encodeSellParams,
  suggestedSharesToZero,
  type HarvestCandidate,
  type HarvestInputs,
  type HarvestResult,
  type SellInstruction,
} from "@/lib/tax/loss-harvest";

const fmtEur = (v: number) =>
  (v >= 0 ? "" : "−") + "€" + Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  // mutate this immediately so the checkbox flips on first frame; the
  // useEffect resyncs once the RSC payload arrives. Without this, the
  // checkbox state lags behind the click by an entire round-trip and the
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

  const toggleSell = useCallback((c: HarvestCandidate) => {
    const key = `${c.symbol}.${c.broker}`;
    const next = [...optimisticSells];
    const idx = next.findIndex((s) => `${s.candidate.symbol}.${s.candidate.broker}` === key);
    if (idx >= 0) next.splice(idx, 1);
    else next.push({ candidate: c, qtyToSell: c.qty, realisedLossEur: c.unrealisedLossEur });
    updateUrl(next);
  }, [optimisticSells, updateUrl]);

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

  return (
    <div className="space-y-4">
      <DisclaimerBanner />

      <BucketSituation
        overages={overages}
        aktienGross={inputs.aktien.totalIncomeEur}
        sonstigeGross={inputs.sonstige.totalIncomeEur}
        allowanceEur={inputs.allowanceEur}
        aktienOnlyCandidates={aktienHasCandidatesButNoOverage && sonstigeCands.length === 0}
        sonstigeOnlyCandidates={sonstigeHasCandidatesButNoOverage && aktienCands.length === 0}
      />

      {/* Summary cards. While the RSC refetch is in flight after a click,
          the optimisticSells already reflects the new selection but the
          summary numbers are still last-frame's — fade the cards slightly
          so the user knows fresh totals are loading. */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity duration-150 ${isPending ? "opacity-60" : "opacity-100"}`}>
        <SummaryCard
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
        <SummaryCard
          label="Sonstige bucket"
          value={fmtEur(result.sonstigeNetEur)}
          sub={
            overages.sonstige > 0
              ? `${fmtEur(overages.sonstige)} over the cap — sell Sonstige losers to reduce`
              : `Already inside the Pauschbetrag for this bucket`
          }
          help="ETFs, bonds, dividends, interest. Forecast dividends included. §20 Abs. 6 EStG: floored at €0 — losses here cannot offset the Aktien bucket."
        />
        <SummaryCard
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
        <SummaryCard
          label="Tax saved"
          value={fmtEur(result.estTaxSavedEur)}
          sub={
            result.estTaxSavedEur > 0
              ? `vs. doing nothing · ${forecastDaysRemaining > 0 ? `${forecastDaysRemaining}d to Dec 31` : "end of year"}`
              : forecastDaysRemaining > 0
                ? `Select losses to see savings · ${forecastDaysRemaining}d to Dec 31`
                : `End of tax year reached`
          }
          highlight={result.estTaxSavedEur > 0 ? "mint" : undefined}
          help="Estimated tax saved vs. the current 'do nothing' baseline. Excludes Kirchensteuer."
        />
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={applyOptimum}
          disabled={optimum.length === 0}
          className="bg-mint text-bg font-mono text-[11px] uppercase tracking-widest px-4 py-2 rounded-md font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
          title={optimum.length === 0 ? "Already inside the Pauschbetrag — no harvest needed." : `Apply ${optimum.length} suggested sell${optimum.length === 1 ? "" : "s"}.`}
        >
          Auto-pick optimum
        </button>
        <button
          onClick={clearAll}
          disabled={optimisticSells.length === 0}
          className="border border-borderHard text-ink font-mono text-[11px] uppercase tracking-widest px-4 py-2 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Clear all
        </button>
        <div className="font-mono text-[11px] text-muted ml-auto flex items-center gap-2">
          {isPending && (
            <span
              className="inline-flex items-center gap-1 text-mint"
              title="Recomputing totals after your last change"
            >
              <Spinner />
              <span>Updating…</span>
            </span>
          )}
          <span>{optimisticSells.length} of {candidates.length} positions selected · {fmtEur(result.totalLossRealisedEur)} loss realised</span>
        </div>
      </div>

      {optimisticSells.length > 0 && <WashSaleWarning />}
      {hasSonstigeSell && <TeilfreistellungNote />}

      <BucketSection
        title="Aktien — individual stocks"
        subtitle={
          overages.aktien > 0
            ? `${fmtEur(overages.aktien)} of Aktien overage to cover · gross €${inputs.aktien.totalIncomeEur.toFixed(0)}`
            : `Aktien bucket has no overage to cover · losses here carry forward to next year`
        }
        candidates={aktienCands}
        sellByKey={sellByKey}
        bucketOverage={overages.aktien}
        onToggle={toggleSell}
        onCommitQty={setQty}
      />
      <BucketSection
        title="Sonstige — ETFs, bonds, dividends, interest"
        subtitle={
          overages.sonstige > 0
            ? `${fmtEur(overages.sonstige)} of Sonstige overage to cover · gross €${inputs.sonstige.totalIncomeEur.toFixed(0)} incl. forecast`
            : `Sonstige bucket already inside the Pauschbetrag`
        }
        candidates={sonstigeCands}
        sellByKey={sellByKey}
        bucketOverage={overages.sonstige}
        onToggle={toggleSell}
        onCommitQty={setQty}
      />

      <BucketSplitFootnote />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Header banner that explicitly tells the user where the overage sits and
 * whether their loss candidates can do anything about it. Previously the
 * "all stock losses but Sonstige overage" situation was invisible — the user
 * thought selling DIS would reduce the €171 forecast, when in fact §20
 * Abs. 6 EStG forbids it.
 */
function BucketSituation({
  overages,
  aktienGross,
  sonstigeGross,
  allowanceEur,
  aktienOnlyCandidates,
  sonstigeOnlyCandidates,
}: {
  overages: { aktien: number; sonstige: number };
  aktienGross: number;
  sonstigeGross: number;
  allowanceEur: number;
  aktienOnlyCandidates: boolean;
  sonstigeOnlyCandidates: boolean;
}) {
  const totalOverage = overages.aktien + overages.sonstige;
  if (totalOverage <= 0) {
    return (
      <div className="font-mono text-[11px] text-mint bg-mint/5 border border-mint/25 rounded-md px-3 py-2.5">
        <strong>You&apos;re already inside the €{allowanceEur.toLocaleString("de-DE")} Pauschbetrag.</strong>{" "}
        Aktien net €{aktienGross.toFixed(0)} · Sonstige net €{sonstigeGross.toFixed(0)} · no harvest needed.
      </div>
    );
  }
  // The pathological case: overage lives entirely in a bucket where the user
  // has no loss candidates. Selling won't help this year.
  if (aktienOnlyCandidates && overages.sonstige > 0 && overages.aktien <= 0) {
    return (
      <div className="font-mono text-[11px] text-amber bg-amber/10 border border-amber/25 rounded-md px-3 py-2.5">
        <strong>Your overage (€{overages.sonstige.toFixed(0)}) is in the Sonstige bucket, but all your loss candidates are Aktien.</strong>{" "}
        Under §20 Abs. 6 EStG, stock losses cannot offset dividend/ETF income — selling them now would just carry the
        losses forward to next year as Aktien-only losses, with <em>no impact</em> on this year&apos;s taxable base.
      </div>
    );
  }
  if (sonstigeOnlyCandidates && overages.aktien > 0 && overages.sonstige <= 0) {
    return (
      <div className="font-mono text-[11px] text-amber bg-amber/10 border border-amber/25 rounded-md px-3 py-2.5">
        <strong>Your overage (€{overages.aktien.toFixed(0)}) is in the Aktien bucket, but all your loss candidates are Sonstige.</strong>{" "}
        §20 Abs. 6 EStG: those losses can&apos;t offset stock gains — they&apos;d carry forward instead.
      </div>
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
      <div className="font-mono text-[11px] text-ink bg-panel2 border border-border rounded-md px-3 py-2.5 space-y-1">
        <div>
          <strong>Overage to cover: €{smaller.toFixed(0)}</strong>{" "}
          (taxable base — the single shared figure, not summed across buckets).
        </div>
        <div className="text-muted">
          Either bucket alone can zero it — Aktien losses absorb up to €{overages.aktien.toFixed(0)}, Sonstige up to
          €{overages.sonstige.toFixed(0)}. Pick whichever bucket you have better losers in. The &quot;To zero&quot; column
          shows how many shares of each position would do it on its own.
        </div>
      </div>
    );
  }
  const parts: string[] = [];
  if (overages.aktien > 0) parts.push(`€${overages.aktien.toFixed(0)} Aktien`);
  if (overages.sonstige > 0) parts.push(`€${overages.sonstige.toFixed(0)} Sonstige`);
  return (
    <div className="font-mono text-[11px] text-ink bg-panel2 border border-border rounded-md px-3 py-2.5">
      <strong>Overage to cover:</strong> {parts.join(" · ")}. Sell losers in the matching bucket to reduce taxable base — the
      &quot;To zero&quot; column shows how many shares of each position would do it.
    </div>
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
    <div className="font-mono text-[11px] text-amber bg-amber/10 border border-amber/25 rounded-md px-3 py-2.5">
      <strong>Estimation only — not tax advice.</strong> Bucket attribution (Aktien vs Sonstige) follows §20 Abs. 6 EStG to the best
      of our data. For material amounts, consult a Steuerberater before acting.
    </div>
  );
}

function WashSaleWarning() {
  return (
    <div className="font-mono text-[11px] text-amber bg-amber/10 border border-amber/25 rounded-md px-3 py-2">
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

function SummaryCard({
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
    <Card className="space-y-1">
      <div className="font-mono text-[10px] uppercase tracking-widest text-dim cursor-help" title={help}>
        {label}&nbsp;ⓘ
      </div>
      <div className={`text-2xl font-bold ${highlight === "mint" ? "text-mint" : "text-ink"}`}>{value}</div>
      <div className="font-mono text-[10px] text-muted">{sub}</div>
    </Card>
  );
}

/**
 * Single harvest candidate row with isolated local state for the qty input.
 *
 * Why local state: the input was previously bound directly to the server-
 * derived `sel.qtyToSell` and every keystroke fired router.replace, causing
 * an RSC refetch that snapped the value back mid-edit. The page felt
 * frozen and "blocking input during request".
 *
 * Now: the input owns a local `draft` integer. Typing updates `draft`
 * immediately (no network). The URL only updates on:
 *   1. blur (the user tabbed or clicked away)
 *   2. Enter
 *   3. the user toggling the checkbox off (handled by parent)
 * When the `sel` prop changes externally (e.g. Auto-pick was clicked,
 * or the user navigated back), `draft` resyncs in the effect.
 */
function CandidateRow({
  c,
  sel,
  bucketOverage,
  onToggle,
  onCommitQty,
}: {
  c: HarvestCandidate;
  sel: SellInstruction | undefined;
  /** Remaining overage in THIS row's bucket. Drives the per-row suggestion. */
  bucketOverage: number;
  onToggle: (c: HarvestCandidate) => void;
  onCommitQty: (c: HarvestCandidate, qty: number) => void;
}) {
  const selected = !!sel;
  const committedQty = sel?.qtyToSell ?? c.qty;
  const [draft, setDraft] = useState<number>(committedQty);

  // Resync draft when committedQty changes from outside (Auto-pick, Clear,
  // back/forward nav). Comparing numbers — useEffect won't loop because
  // setDraft is a no-op when the value is unchanged.
  useEffect(() => {
    setDraft(committedQty);
  }, [committedQty]);

  const commit = () => {
    if (!selected) return;
    const clamped = Math.max(0, Math.min(c.qty, Number.isFinite(draft) ? draft : 0));
    if (clamped !== committedQty) onCommitQty(c, clamped);
  };

  // Bucket-aware suggestion: whole shares of THIS position that would zero
  // the remaining overage in this row's bucket. Returns null when the
  // bucket already fits inside the Pauschbetrag (i.e. selling this row
  // wouldn't reduce taxable base — only carry the loss forward).
  const suggested = suggestedSharesToZero(c, c.bucket === "aktien" ? { aktien: bucketOverage, sonstige: 0 } : { aktien: 0, sonstige: bucketOverage });

  // INTENTIONAL: clicking the "To zero" button auto-selects the row even
  // when the checkbox was previously unchecked. The user's explicit click
  // expresses "yes, apply this suggestion" — different from the onBlur
  // `commit` path which discards the draft when unselected (since typing
  // alone might just be the user exploring numbers). Don't add a
  // `if (!selected) return` guard here.
  const applySuggested = () => {
    if (suggested === null) return;
    setDraft(suggested);
    onCommitQty(c, suggested);
  };

  return (
    <div
      className={`grid grid-cols-[40px_1fr] lg:grid-cols-[40px_1.4fr_0.55fr_0.55fr_0.65fr_0.65fr_0.8fr_0.8fr_0.85fr_0.8fr] gap-2 lg:gap-0 px-4 lg:px-5 py-3 items-center border-b border-border last:border-b-0 ${selected ? "bg-bad/5" : ""}`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(c)}
        className="w-4 h-4 accent-bad cursor-pointer"
        aria-label={`Select ${c.symbol} for harvest`}
      />
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center font-mono text-[11px] font-bold shrink-0 bg-panel2 text-muted">
          {avatarLabel(c.symbol, c.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[13px]">
            {c.symbol}
            {c.hiddenLoss && (
              <span
                className="font-mono text-[10px] ml-1.5 px-1 py-0.5 rounded bg-amber/10 text-amber cursor-help"
                title={`Position is ${c.positionPlEur !== null && c.positionPlEur >= 0 ? "+" : ""}€${(c.positionPlEur ?? 0).toFixed(2)} overall, but under FIFO (§20 Abs. 4 EStG) a sale consumes the OLDEST lots first — and the first ${c.qty} share${c.qty === 1 ? "" : "s"} sit above the current price. Selling exactly ${c.qty} realises ${fmtEur(c.unrealisedLossEur)} of loss while keeping the cheaper, profitable lots.`}
              >
                FIFO
              </span>
            )}
          </div>
          {c.name && <div className="text-[11px] text-muted truncate">{c.name}</div>}
        </div>
      </div>
      <span className={`hidden lg:inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] tracking-wider w-fit ${brokerChip(c.broker)}`}>{c.broker}</span>
      <span
        className="hidden lg:block text-right font-mono text-xs text-muted"
        title={c.qty < c.positionQty ? `Harvest cap: selling more than ${c.qty} of the ${c.positionQty} held starts consuming cheaper (profitable) lots and erodes the loss.` : undefined}
      >
        {c.qty < c.positionQty ? `${c.qty} of ${c.positionQty}` : c.qty}
      </span>
      <span className="hidden lg:block text-right font-mono text-xs text-muted">{c.avgCostEur.toFixed(2)}</span>
      <span className="hidden lg:block text-right font-mono text-xs">{c.pricePerUnitEur.toFixed(2)}</span>
      <span className="hidden lg:block text-right font-mono font-semibold text-xs text-bad">{fmtEur(c.unrealisedLossEur)}</span>
      <span className="hidden lg:block text-right font-mono text-xs text-bad">{fmtEur(c.lossPerShareEur)}</span>
      <span className="hidden lg:flex justify-end items-center">
        {suggested === null ? (
          <span
            className="font-mono text-[11px] text-dim cursor-help"
            title={
              c.bucket === "aktien"
                ? "Aktien bucket has no overage to cover — selling this loss would carry forward to next year, not reduce this year's taxable base."
                : "Sonstige bucket has no overage to cover — selling this loss would carry forward to next year, not reduce this year's taxable base."
            }
          >—</span>
        ) : (
          <button
            type="button"
            onClick={applySuggested}
            title={`Click to apply: sell ${suggested} share${suggested === 1 ? "" : "s"} (zeros this bucket's overage)`}
            className="font-mono text-xs px-2 py-1 rounded border border-mint/30 bg-mint/10 text-mint hover:bg-mint/20 cursor-pointer transition-colors"
          >
            {suggested}
          </button>
        )}
      </span>
      <span className="hidden lg:flex justify-end items-center">
        <input
          type="number"
          min={0}
          max={c.qty}
          step={1}
          value={Number.isFinite(draft) ? draft : ""}
          onChange={(e) => setDraft(Number(e.target.value))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraft(committedQty);
              e.currentTarget.blur();
            }
          }}
          disabled={!selected}
          title={selected ? "Press Enter or Tab to commit · Esc to revert" : "Check the box to enable"}
          className="bg-panel2 border border-border rounded font-mono text-xs w-20 text-right px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
        />
      </span>
    </div>
  );
}

function BucketSection({
  title,
  subtitle,
  candidates,
  sellByKey,
  bucketOverage,
  onToggle,
  onCommitQty,
}: {
  title: string;
  subtitle: string;
  candidates: HarvestCandidate[];
  sellByKey: Map<string, SellInstruction>;
  /** Remaining overage in this bucket (already nets out user's sells in this bucket). */
  bucketOverage: number;
  onToggle: (c: HarvestCandidate) => void;
  onCommitQty: (c: HarvestCandidate, qty: number) => void;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex justify-between items-baseline px-5 py-3 border-b border-border">
        <div>
          <div className="font-semibold text-sm">{title}</div>
          <div className="font-mono text-[10px] text-muted mt-0.5">{subtitle}</div>
        </div>
        <div className="font-mono text-[11px] text-muted">{candidates.length} holding{candidates.length === 1 ? "" : "s"}</div>
      </div>
      {candidates.length === 0 && (
        <div className="px-5 py-4 text-muted text-sm">No unrealised losses in this bucket.</div>
      )}
      {candidates.length > 0 && (
        <>
          <div className="hidden lg:grid grid-cols-[40px_1.4fr_0.55fr_0.55fr_0.65fr_0.65fr_0.8fr_0.8fr_0.85fr_0.8fr] gap-0 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
            <span></span>
            <span>Holding</span>
            <span>Broker</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Avg €</span>
            <span className="text-right">Price €</span>
            <span className="text-right">Loss €</span>
            <span className="text-right">Loss/sh</span>
            <span
              className="text-right cursor-help"
              title="Whole shares needed to zero this bucket's remaining overage. Updates as you adjust other rows. Click the number to apply it."
            >To&nbsp;zero&nbsp;ⓘ</span>
            <span className="text-right">Sell qty</span>
          </div>
          {candidates.map((c) => (
            <CandidateRow
              key={`${c.symbol}.${c.broker}`}
              c={c}
              sel={sellByKey.get(`${c.symbol}.${c.broker}`)}
              bucketOverage={bucketOverage}
              onToggle={onToggle}
              onCommitQty={onCommitQty}
            />
          ))}
        </>
      )}
    </Card>
  );
}
