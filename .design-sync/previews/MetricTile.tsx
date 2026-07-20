import { MetricTile } from "report-readr-fe";
import { Frame } from "./_frame";

/** The canonical use: a positive figure, mint accent, with a sublabel. */
export function Mint() {
  return (
    <Frame className="max-w-xs">
      <MetricTile label="Realisiert 2025" value="+€1 204,50" sublabel="12 Trades" accent="mint" />
    </Frame>
  );
}

/** A warning figure — Sparer-Pauschbetrag nearly exhausted. */
export function Amber() {
  return (
    <Frame className="max-w-xs">
      <MetricTile label="Pauschbetrag genutzt" value="€980 / €1 000" sublabel="98%" accent="amber" />
    </Frame>
  );
}

/** A loss figure. */
export function Bad() {
  return (
    <Frame className="max-w-xs">
      <MetricTile label="Unrealisiert" value="−€387,64" sublabel="ENPH" accent="bad" />
    </Frame>
  );
}

/** Neutral ink accent, and without a sublabel — the minimal state. */
export function Ink() {
  return (
    <Frame className="max-w-xs">
      <MetricTile label="Positionen" value="17" accent="ink" />
    </Frame>
  );
}
