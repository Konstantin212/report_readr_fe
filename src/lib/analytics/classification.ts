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

const VALID_KINDS: ReadonlySet<AssetKind> = new Set(["stock", "etf", "bond", "other"]);

function asAssetKind(kind: string | null | undefined): AssetKind | undefined {
  return kind && VALID_KINDS.has(kind as AssetKind) ? (kind as AssetKind) : undefined;
}

/**
 * Join the user's instruments (ISIN↔symbol) with global metadata and
 * produce a symbol-keyed override map. Precedence per symbol:
 *   1. An `OK` instrument_meta row with a resolved `assetKind` — the
 *      richest source (carries sector / subtype / distribution). Matches
 *      by real ISIN or the synthetic `SYM:{symbol}` key (manual links, AC-4.2).
 *   2. Otherwise, the broker-declared `kind` on the instrument row, when it
 *      is a valid AssetKind. This yields a kind-only override (null sector /
 *      subtype / distribution) so the positions page picks the right table
 *      and the tax layer the right form; subtype stays null so tax falls
 *      back to FUND_SUBTYPE_MAP → sonstige + warning when unknown (the
 *      conservative default).
 * Symbols with neither get no entry and callers keep today's behavior.
 */
export function buildClassificationOverrides(
  instrumentRows: Array<{ symbol: string | null; isin: string | null; kind?: string | null }>,
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
    if (meta && meta.assetKind) {
      out.set(inst.symbol, {
        kind: meta.assetKind,
        sector: meta.sector,
        subtype: meta.fundSubtype,
        distribution: meta.distributionPolicy
          ? { policy: meta.distributionPolicy, frequency: meta.distributionFrequency }
          : null,
      });
      continue;
    }
    const brokerKind = asAssetKind(inst.kind);
    if (brokerKind) {
      out.set(inst.symbol, { kind: brokerKind, sector: null, subtype: null, distribution: null });
    }
  }
  return out;
}

export type ClassificationContext = {
  overrides: Map<string, ClassificationOverride>;
  instrumentRows: Awaited<ReturnType<typeof getUserInstruments>>;
};

/**
 * Load the override map AND return the instrument rows it was built from,
 * so callers that also need the ISIN↔symbol rows (the tax loaders) don't
 * re-query `getUserInstruments` — on Neon's HTTP driver each query is its
 * own round-trip.
 */
export async function loadClassificationContext(ownerUserId: string): Promise<ClassificationContext> {
  const [instrumentRows, metaRows] = await Promise.all([
    getUserInstruments(ownerUserId),
    getAllMeta(),
  ]);
  return { overrides: buildClassificationOverrides(instrumentRows, metaRows), instrumentRows };
}

export async function loadClassificationOverrides(
  ownerUserId: string,
): Promise<Map<string, ClassificationOverride>> {
  return (await loadClassificationContext(ownerUserId)).overrides;
}
