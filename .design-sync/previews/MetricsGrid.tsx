import { MetricsGrid } from "report-readr-fe";
import type { HeroMetric } from "report-readr-fe";
import { Frame } from "./_frame";

/** The canonical use: three columns, sign-driven auto accent, sublines. */
export function TaxSummary() {
  const metrics: HeroMetric[] = [
    { label: "Kapitalerträge", value: "€3 812,40", subline: "Steuerjahr 2025", accent: "ink" },
    { label: "Realisierte Gewinne", value: "+€1 204,50", subline: "12 Trades", accent: "auto", sign: 1 },
    { label: "Verlustvortrag Aktien", value: "−€1 204,50", subline: "aus 2024", accent: "auto", sign: -1 },
  ];
  return (
    <Frame className="max-w-4xl">
      <MetricsGrid metrics={metrics} columns={3} />
    </Frame>
  );
}

/** Four-column layout — the dashboard hero row. */
export function DashboardHero() {
  const metrics: HeroMetric[] = [
    { label: "Portfoliowert", value: "€48 261,04", subline: "3 Broker", accent: "ink" },
    { label: "Unrealisiert", value: "+€2 118,92", accent: "auto", sign: 1 },
    { label: "Dividenden YTD", value: "€612,33", subline: "18 Zahlungen", accent: "mint" },
    { label: "Abgeltungssteuer", value: "€952,10", accent: "amber" },
  ];
  return (
    <Frame className="max-w-5xl">
      <MetricsGrid metrics={metrics} columns={4} />
    </Frame>
  );
}

/** Two columns with a trailing pill and a smaller secondary value size. */
export function WithTrailing() {
  const metrics: HeroMetric[] = [
    {
      label: "Sparer-Pauschbetrag",
      value: "€980 / €1 000",
      subline: "98% ausgeschöpft",
      accent: "amber",
      valueSize: "lg",
      trailing: (
        <span className="inline-block font-mono text-[10px] uppercase tracking-widest text-amber bg-amber/10 border border-amber/30 rounded-full px-2 py-0.5">
          Fast erreicht
        </span>
      ),
    },
    {
      label: "Freistellungsauftrag FF",
      value: "€620 / €700",
      subline: "Freedom Finance",
      accent: "ink",
      valueSize: "lg",
    },
  ];
  return (
    <Frame className="max-w-2xl">
      <MetricsGrid metrics={metrics} columns={2} />
    </Frame>
  );
}
