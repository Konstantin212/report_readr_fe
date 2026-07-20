import { KpiStrip } from "report-readr-fe";
import type { KpiStripItem } from "report-readr-fe";
import { Frame } from "./_frame";

/** The canonical use: a four-up dashboard header strip. */
export function Overview() {
  const items: KpiStripItem[] = [
    { label: "Portfoliowert", value: "€48 261,04", sublabel: "3 Broker", accent: "ink" },
    { label: "Realisiert 2025", value: "+€1 204,50", sublabel: "12 Trades", accent: "mint" },
    { label: "Unrealisiert", value: "−€612,88", sublabel: "5 Positionen", accent: "bad" },
    { label: "Pauschbetrag", value: "€980 / €1 000", sublabel: "98% genutzt", accent: "amber" },
  ];
  return (
    <Frame>
      <KpiStrip items={items} />
    </Frame>
  );
}

/** A three-up tax-focused strip, the main variant seen on /tax. */
export function TaxYear() {
  const items: KpiStripItem[] = [
    { label: "Kapitalerträge", value: "€3 812,40", accent: "ink" },
    { label: "Verlustvortrag Aktien", value: "€1 204,50", accent: "bad" },
    { label: "Abgeltungssteuer", value: "€952,10", accent: "amber" },
  ];
  return (
    <Frame>
      <KpiStrip items={items} />
    </Frame>
  );
}

/** The minimal two-column shape. */
export function TwoUp() {
  const items: KpiStripItem[] = [
    { label: "Dividenden YTD", value: "€612,33", accent: "mint" },
    { label: "Quellensteuer", value: "€91,85", accent: "ink" },
  ];
  return (
    <Frame>
      <KpiStrip items={items} />
    </Frame>
  );
}
