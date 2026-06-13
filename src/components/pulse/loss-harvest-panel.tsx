"use client";
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "./card";
import {
  encodeSellParams,
  type HarvestCandidate,
  type HarvestInputs,
  type HarvestResult,
  type SellInstruction,
} from "@/lib/tax/loss-harvest";

const fmtEur = (v: number) =>
  (v >= 0 ? "" : "−") + "€" + Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEur0 = (v: number) =>
  (v >= 0 ? "" : "−") + "€" + Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

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

  // Selection state lives in ?sell=… so it's shareable and survives reload.
  // Server has already decoded the param into `sells`; we just rewrite the URL
  // on every interaction without bouncing through local React state.
  const updateUrl = useCallback((next: SellInstruction[]) => {
    const usp = new URLSearchParams(searchParams.toString());
    const encoded = encodeSellParams(next);
    if (encoded) usp.set("sell", encoded);
    else usp.delete("sell");
    router.replace(`/tax/${year}/loss-harvest${usp.toString() ? `?${usp.toString()}` : ""}` as never, { scroll: false });
  }, [searchParams, router, year]);

  const sellByKey = useMemo(() => {
    const m = new Map<string, SellInstruction>();
    for (const s of sells) m.set(`${s.candidate.symbol}.${s.candidate.broker}`, s);
    return m;
  }, [sells]);

  const toggleSell = useCallback((c: HarvestCandidate) => {
    const key = `${c.symbol}.${c.broker}`;
    const next = [...sells];
    const idx = next.findIndex((s) => `${s.candidate.symbol}.${s.candidate.broker}` === key);
    if (idx >= 0) next.splice(idx, 1);
    else next.push({ candidate: c, qtyToSell: c.qty, realisedLossEur: c.unrealisedLossEur });
    updateUrl(next);
  }, [sells, updateUrl]);

  const setQty = useCallback((c: HarvestCandidate, qty: number) => {
    const key = `${c.symbol}.${c.broker}`;
    const clamped = Math.max(0, Math.min(c.qty, Number.isFinite(qty) ? qty : 0));
    const next = sells
      .filter((s) => `${s.candidate.symbol}.${s.candidate.broker}` !== key)
      .concat(clamped > 0 ? [{ candidate: c, qtyToSell: clamped, realisedLossEur: c.lossPerShareEur * clamped }] : []);
    updateUrl(next);
  }, [sells, updateUrl]);

  const applyOptimum = useCallback(() => updateUrl(optimum), [optimum, updateUrl]);
  const clearAll = useCallback(() => updateUrl([]), [updateUrl]);

  const aktienCands = candidates.filter((c) => c.bucket === "aktien");
  const sonstigeCands = candidates.filter((c) => c.bucket === "sonstige");
  const hasSonstigeSell = sells.some((s) => s.candidate.bucket === "sonstige");

  const currentTaxableBase = Math.max(
    0,
    Math.max(0, inputs.aktien.totalIncomeEur) + Math.max(0, inputs.sonstige.totalIncomeEur) - inputs.allowanceEur,
  );

  return (
    <div className="space-y-4">
      <DisclaimerBanner />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Aktien bucket"
          value={fmtEur(result.aktienNetEur)}
          sub={`gross €${inputs.aktien.totalIncomeEur.toFixed(0)} · loss applied €${(result.aktienNetEur - inputs.aktien.totalIncomeEur).toFixed(0)}`}
          help="Individual-stock income net of selected stock losses. Floored at €0 — under §20 Abs. 6 EStG losses here cannot offset the Sonstige bucket."
        />
        <SummaryCard
          label="Sonstige bucket"
          value={fmtEur(result.sonstigeNetEur)}
          sub={`gross €${inputs.sonstige.totalIncomeEur.toFixed(0)} · loss applied €${(result.sonstigeNetEur - inputs.sonstige.totalIncomeEur).toFixed(0)}`}
          help="ETFs, bonds, dividends, interest. Forecast dividends included. Floored at €0."
        />
        <SummaryCard
          label="Taxable base"
          value={fmtEur(result.taxableBaseEur)}
          sub={`was ${fmtEur(currentTaxableBase)} · Pauschbetrag €${inputs.allowanceEur.toLocaleString("de-DE")}`}
          highlight={result.taxableBaseEur < currentTaxableBase ? "mint" : undefined}
          help="Net capital income above the Sparer-Pauschbetrag — taxed at the Abgeltungsteuer flat rate."
        />
        <SummaryCard
          label="Tax saved"
          value={fmtEur(result.estTaxSavedEur)}
          sub={`@ 26.375% (KapESt + Soli)${forecastDaysRemaining > 0 ? ` · ${forecastDaysRemaining}d to Dec 31` : ""}`}
          highlight={result.estTaxSavedEur > 0 ? "mint" : undefined}
          help="Estimated tax saved vs. doing nothing. Does not include Kirchensteuer."
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
          disabled={sells.length === 0}
          className="border border-borderHard text-ink font-mono text-[11px] uppercase tracking-widest px-4 py-2 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Clear all
        </button>
        <div className="font-mono text-[11px] text-muted ml-auto">
          {sells.length} of {candidates.length} positions selected · {fmtEur(result.totalLossRealisedEur)} loss realised
        </div>
      </div>

      {sells.length > 0 && <WashSaleWarning />}
      {hasSonstigeSell && <TeilfreistellungNote />}

      <BucketSection
        title="Aktien — individual stocks"
        subtitle={`Losses here can only offset stock gains (Aktien gross €${inputs.aktien.totalIncomeEur.toFixed(0)} this year)`}
        candidates={aktienCands}
        sellByKey={sellByKey}
        onToggle={toggleSell}
        onQty={setQty}
      />
      <BucketSection
        title="Sonstige — ETFs, bonds, dividends, interest"
        subtitle={`Losses here can only offset Sonstige income (Sonstige gross €${inputs.sonstige.totalIncomeEur.toFixed(0)} incl. forecast)`}
        candidates={sonstigeCands}
        sellByKey={sellByKey}
        onToggle={toggleSell}
        onQty={setQty}
      />

      <BucketSplitFootnote />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function BucketSection({
  title,
  subtitle,
  candidates,
  sellByKey,
  onToggle,
  onQty,
}: {
  title: string;
  subtitle: string;
  candidates: HarvestCandidate[];
  sellByKey: Map<string, SellInstruction>;
  onToggle: (c: HarvestCandidate) => void;
  onQty: (c: HarvestCandidate, qty: number) => void;
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
          <div className="hidden lg:grid grid-cols-[40px_1.4fr_0.55fr_0.55fr_0.65fr_0.65fr_0.8fr_0.8fr_0.8fr] gap-0 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
            <span></span>
            <span>Holding</span>
            <span>Broker</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Avg €</span>
            <span className="text-right">Price €</span>
            <span className="text-right">Loss €</span>
            <span className="text-right">Loss/sh</span>
            <span className="text-right">Sell qty</span>
          </div>
          {candidates.map((c) => {
            const key = `${c.symbol}.${c.broker}`;
            const sel = sellByKey.get(key);
            const selected = !!sel;
            return (
              <div
                key={key}
                className={`grid grid-cols-[40px_1fr] lg:grid-cols-[40px_1.4fr_0.55fr_0.55fr_0.65fr_0.65fr_0.8fr_0.8fr_0.8fr] gap-2 lg:gap-0 px-4 lg:px-5 py-3 items-center border-b border-border last:border-b-0 ${selected ? "bg-bad/5" : ""}`}
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
                    <div className="font-semibold text-[13px]">{c.symbol}</div>
                    {c.name && <div className="text-[11px] text-muted truncate">{c.name}</div>}
                  </div>
                </div>
                <span className={`hidden lg:inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] tracking-wider w-fit ${brokerChip(c.broker)}`}>{c.broker}</span>
                <span className="hidden lg:block text-right font-mono text-xs text-muted">{c.qty}</span>
                <span className="hidden lg:block text-right font-mono text-xs text-muted">{c.avgCostEur.toFixed(2)}</span>
                <span className="hidden lg:block text-right font-mono text-xs">{c.pricePerUnitEur.toFixed(2)}</span>
                <span className="hidden lg:block text-right font-mono font-semibold text-xs text-bad">{fmtEur(c.unrealisedLossEur)}</span>
                <span className="hidden lg:block text-right font-mono text-xs text-bad">{fmtEur(c.lossPerShareEur)}</span>
                <span className="hidden lg:flex justify-end items-center">
                  <input
                    type="number"
                    min={0}
                    max={c.qty}
                    step={1}
                    value={sel?.qtyToSell ?? c.qty}
                    onChange={(e) => onQty(c, Number(e.target.value))}
                    disabled={!selected}
                    className="bg-panel2 border border-border rounded font-mono text-xs w-20 text-right px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </span>
              </div>
            );
          })}
        </>
      )}
    </Card>
  );
}
