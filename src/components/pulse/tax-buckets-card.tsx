"use client";

/**
 * The two §20 Abs. 6 EStG loss pots, side by side.
 *
 * Why this card exists: the hero used to show "Net realized −€1,674" next to
 * "Taxable base €0", which reads as *the loss cancelled my tax*. It didn't.
 * Share losses may ONLY offset share gains (§20 Abs. 6 S. 4) — they can never
 * reduce ETF gains, dividends or interest. The unusable remainder becomes a
 * Verlustvortrag: real future relief, but worth €0 this year. Showing the pots
 * separately (and the carryforward explicitly) is the only honest presentation.
 */
import { Card } from "@/components/pulse/card";

type Bucket = {
  gainsEur: number;
  lossesEur: number;
  netEur: number;
  taxableEur: number;
};

export type TaxBucketsView = {
  aktien: Bucket & { carryforwardEur: number };
  sonstige: Bucket & { dividendsEur: number; interestEur: number };
  allowanceEur: number;
  allowanceUsedEur: number;
  taxableBaseEur: number;
  estTaxEur: number;
};

const eur = (v: number, sign = false) =>
  `${sign && v > 0 ? "+" : v < 0 ? "−" : ""}€${Math.abs(v).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function Row({ label, value, tone, title }: { label: string; value: string; tone?: "good" | "bad" | "dim"; title?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3" title={title}>
      <span className="font-mono text-[11px] text-muted">{label}</span>
      <span
        className={`font-mono text-[12px] ${
          tone === "good" ? "text-mint" : tone === "bad" ? "text-bad" : tone === "dim" ? "text-dim" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function TaxBucketsCard({ b }: { b: TaxBucketsView }) {
  return (
    <Card>
      <div className="flex justify-between items-center">
        <div className="font-semibold text-sm">Loss buckets</div>
        <div className="font-mono text-[11px] text-muted">§20 Abs. 6 EStG</div>
      </div>

      <div className="mt-2 text-[12px] text-muted leading-relaxed">
        Share losses can only offset <span className="text-ink">share gains</span> — never ETF gains,
        dividends or interest. Each pot is taxed on its own.
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Aktien */}
        <div className="bg-panel2 rounded-[14px] p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-dim uppercase tracking-widest">Aktien</span>
            <span className="font-mono text-[10px] text-dim">Einzelaktien</span>
          </div>
          <Row label="Gains" value={eur(b.aktien.gainsEur, true)} tone="good" />
          <Row label="Losses" value={eur(b.aktien.lossesEur)} tone="bad" />
          <div className="border-t border-border my-1" />
          <Row label="Taxable from this pot" value={eur(b.aktien.taxableEur)} />
          {b.aktien.carryforwardEur > 0 && (
            <Row
              label="Verlustvortrag →"
              value={eur(-b.aktien.carryforwardEur)}
              tone="dim"
              title="Unusable this year. Carried forward and may only ever offset FUTURE share gains (§20 Abs. 6 S. 4). It does not reduce this year's tax."
            />
          )}
        </div>

        {/* Sonstige */}
        <div className="bg-panel2 rounded-[14px] p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-dim uppercase tracking-widest">Sonstige</span>
            <span className="font-mono text-[10px] text-dim">ETFs · bonds · income</span>
          </div>
          <Row label="Realized gains" value={eur(b.sonstige.gainsEur, true)} tone="good" />
          <Row label="Realized losses" value={eur(b.sonstige.lossesEur)} tone="bad" />
          <Row label="Dividends" value={eur(b.sonstige.dividendsEur, true)} />
          <Row label="Interest" value={eur(b.sonstige.interestEur, true)} />
          <div className="border-t border-border my-1" />
          <Row label="Taxable from this pot" value={eur(b.sonstige.taxableEur)} />
        </div>
      </div>

      <div className="mt-3 bg-panel2 rounded-[14px] p-3 space-y-1.5">
        <Row label="Combined taxable income" value={eur(b.aktien.taxableEur + b.sonstige.taxableEur)} />
        <Row label={`Sparer-Pauschbetrag used`} value={eur(-b.allowanceUsedEur)} tone="good" />
        <div className="border-t border-border my-1" />
        <Row label="Taxable base" value={eur(b.taxableBaseEur)} />
        <Row label="Estimated tax (26.375%)" value={eur(b.estTaxEur)} tone={b.estTaxEur > 0 ? "bad" : undefined} />
      </div>

      {b.aktien.carryforwardEur > 0 && b.taxableBaseEur === 0 && (
        <div className="mt-3 font-mono text-[11px] text-amber leading-relaxed">
          Note: your {eur(b.aktien.carryforwardEur)} share loss did not reduce this year&apos;s tax — it
          is carried forward. Tax is €0 only because the Sonstige pot stayed under the allowance.
        </div>
      )}
    </Card>
  );
}
