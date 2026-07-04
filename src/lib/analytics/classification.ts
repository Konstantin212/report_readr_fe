/**
 * Consumer bridge between the global `instrument_meta` store and the
 * sync, symbol-keyed classifiers (`classifyKind` / `classifySector` /
 * `fundSubtype`). Data loaders (positions, tax) load an override map
 * here and consult it BEFORE falling back to the hardcoded maps in
 * `sector-map.ts`. When no OK metadata row exists for a symbol the map
 * has no entry and callers get exactly today's behavior.
 *
 * `buildClassificationOverrides` is pure (unit-tested without a DB);
 * `loadClassificationOverrides` does the I/O.
 */
import type { AssetKind, FundSubtype } from "@/lib/analytics/sector-map";
import type { DistributionPolicy, InstrumentMeta } from "@/lib/marketdata/types";
import { syntheticIsin } from "@/lib/marketdata/types";
import { getAllMeta, getUserInstruments } from "@/lib/marketdata/store";

export type ClassificationOverride = {
  kind: AssetKind;
  sector: string | null;
  subtype: FundSubtype | null;
  distribution: { policy: DistributionPolicy; frequency: string | null } | null;
};

/**
 * Join the user's instruments (ISIN↔symbol) with global metadata and
 * produce a symbol-keyed override map. Only `status === "OK"` rows with
 * a resolved `assetKind` contribute. A row matches either by real ISIN
 * or by the synthetic `SYM:{symbol}` key (manual Yahoo links, AC-4.2).
 */
export function buildClassificationOverrides(
  instrumentRows: Array<{ symbol: string | null; isin: string | null }>,
  metaRows: InstrumentMeta[],
): Map<string, ClassificationOverride> {
  const metaByIsin = new Map<string, InstrumentMeta>();
  for (const m of metaRows) {
    if (m.status === "OK" && m.assetKind) metaByIsin.set(m.isin, m);
  }

  const out = new Map<string, ClassificationOverride>();
  for (const inst of instrumentRows) {
    if (!inst.symbol) continue;
    const meta =
      (inst.isin ? metaByIsin.get(inst.isin) : undefined) ??
      metaByIsin.get(syntheticIsin(inst.symbol));
    if (!meta || !meta.assetKind) continue;
    out.set(inst.symbol, {
      kind: meta.assetKind,
      sector: meta.sector,
      subtype: meta.fundSubtype,
      distribution: meta.distributionPolicy
        ? { policy: meta.distributionPolicy, frequency: meta.distributionFrequency }
        : null,
    });
  }
  return out;
}

export async function loadClassificationOverrides(
  ownerUserId: string,
): Promise<Map<string, ClassificationOverride>> {
  const [instrumentRows, metaRows] = await Promise.all([
    getUserInstruments(ownerUserId),
    getAllMeta(),
  ]);
  return buildClassificationOverrides(instrumentRows, metaRows);
}
