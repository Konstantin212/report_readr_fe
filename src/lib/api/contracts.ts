/**
 * Shared API contracts — ONE zod schema per endpoint payload, used on BOTH
 * sides of the wire:
 *
 *   BE route   → `validatedJson(schema, data, endpoint)`  (lib/api/validate)
 *   FE client  → `fetchApi(url, schema)`                  (lib/api/client)
 *
 * Each schema is declared with an explicit `z.ZodType<LoaderType>` binding,
 * which is what makes structure changes ripple at COMPILE TIME: when a
 * loader type (PositionsData, SelectedPosition, TaxData, …) changes shape,
 * the schema here stops typechecking — and since the FE clients consume the
 * same inferred types, every affected usage lights up in the same `tsc` run.
 * At RUNTIME both helpers safeParse and console.warn on drift (JSON
 * serialization quirks, deploy skew between an old FE bundle and a new BE)
 * without breaking the response.
 *
 * NOTE: only `import type` from data modules here — this file is imported by
 * client components, so a value import of a getDb-touching module would pull
 * server code into the browser bundle.
 */
import { z } from "zod";

import type { PositionsData, PositionRow, SelectedPosition } from "@/lib/data/positions";
import type { CashByCurrency } from "@/lib/data/cash";
import type { TaxData } from "@/lib/data/tax";
import type { GermanTaxDraft, LegacyGermanTaxDraft, KapEvidenceItem, ZeileValue } from "@/lib/tax/german-tax";
import type { InstrumentMetaView } from "@/components/pulse/instrument-source-card";

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const viewMetricsSchema = z.object({
  avgCostEur: z.number(),
  costEur: z.number(),
  plEur: z.number().nullable(),
  plPct: z.number().nullable(),
  avgCostNative: z.number().nullable(),
  costNative: z.number().nullable(),
  plNative: z.number().nullable(),
});

const distributionSchema = z
  .object({
    policy: z.enum(["DISTRIBUTING", "ACCUMULATING"]),
    frequency: z.string().nullable(),
  })
  .nullable();

// Kept as a plain object schema (not annotated z.ZodType) so .extend() works;
// the binding to the loader type happens on the exported consts below.
const positionRowObject = z.object({
  symbol: z.string(),
  isin: z.string().optional(),
  name: z.string().optional(),
  broker: z.string(),
  currency: z.string(),
  sector: z.string(),
  kind: z.enum(["stock", "etf", "bond", "other"]),
  qty: z.number(),
  pricePerUnitEur: z.number().nullable(),
  marketEur: z.number().nullable(),
  asOf: z.string().nullable(),
  quoteSource: z.string().nullable(),
  quoteUpdatedAt: z.string().nullable(),
  nativeCurrency: z.string().nullable(),
  pricePerUnitNative: z.number().nullable(),
  marketNative: z.number().nullable(),
  views: z.object({ broker: viewMetricsSchema, net: viewMetricsSchema }),
  dividendsEur: z.number(),
  dividendsNative: z.number(),
  feesEur: z.number(),
  distribution: distributionSchema.optional(),
  metaSource: z.string().nullable().optional(),
});

/** Compile-time binding: if PositionRow changes shape, this line errors. */
export const positionRowSchema: z.ZodType<PositionRow> = positionRowObject;

const cashByCurrencySchema: z.ZodType<CashByCurrency> = z.object({
  currency: z.string(),
  amount: z.number(),
  amountEur: z.number(),
  flag: z.string().optional(),
});

const instrumentMetaViewSchema: z.ZodType<InstrumentMetaView> = z.object({
  source: z.string().nullable(),
  assetKind: z.enum(["stock", "etf", "bond", "other"]).nullable(),
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  distribution: distributionSchema,
  terPct: z.string().nullable().optional(),
  teilfreistellungPct: z.number().nullable().optional(),
});

const selectedPositionObject = positionRowObject.extend({
  sparkline: z.array(z.number()),
  sparkPctChange: z.number().nullable(),
  lots: z.array(
    z.object({
      openedAt: z.string(),
      qty: z.string(),
      costEur: z.string(),
      pricePerUnitEur: z.string(),
      pctOfTotal: z.number(),
      gainPct: z.number().nullable(),
    }),
  ),
  dividendsYtdEur: z.number(),
  dividendsTotalEur: z.number(),
  dividendsTotalCount: z.number(),
  yieldOnCostPct: z.number(),
  daysHeld: z.number(),
  transactions: z.array(
    z.object({
      date: z.string(),
      side: z.enum(["buy", "sell"]),
      qty: z.number(),
      priceNative: z.number().nullable(),
      currency: z.string(),
      amountNative: z.number(),
      amountEur: z.number(),
      feeNative: z.number().nullable(),
    }),
  ),
  meta: instrumentMetaViewSchema.nullable(),
});

/** Compile-time binding: if SelectedPosition changes shape, this errors. */
export const selectedPositionSchema: z.ZodType<SelectedPosition> = selectedPositionObject;

// ---------------------------------------------------------------------------
// GET /api/positions
// ---------------------------------------------------------------------------

export const positionsDataSchema: z.ZodType<PositionsData> = z.object({
  rows: z.array(positionRowSchema),
  rowsByKind: z.object({
    stock: z.array(positionRowSchema),
    etf: z.array(positionRowSchema),
    bond: z.array(positionRowSchema),
    other: z.array(positionRowSchema),
  }),
  total: z.number(),
  totalMarketEur: z.number(),
  totalPlEur: z.number(),
  sectors: z.array(z.string()),
  cash: z.array(cashByCurrencySchema),
  selected: selectedPositionSchema.nullable(),
});

// ---------------------------------------------------------------------------
// GET /api/tax/[year]
// ---------------------------------------------------------------------------

const zeileValueSchema: z.ZodType<ZeileValue> = z.object({
  cents: z.string(),
  euros: z.number(),
});

const formTargetSchema = z.enum([
  "KAP_Z19", "KAP_Z20", "KAP_Z22", "KAP_Z23", "KAP_Z51", "KAP_Z52",
  "KAP_INV_S1_Z4", "KAP_INV_S1_Z5", "KAP_INV_S1_Z6", "KAP_INV_S1_Z7", "KAP_INV_S1_Z8",
  "KAP_INV_S2_Z14", "KAP_INV_S2_Z17", "KAP_INV_S2_Z20", "KAP_INV_S2_Z23", "KAP_INV_S2_Z26",
]);

const kapEvidenceItemSchema: z.ZodType<KapEvidenceItem> = z.object({
  date: z.string(),
  symbol: z.string().optional(),
  ticker: z.string().optional(),
  country: z.string().optional(),
  grossEur: z.string(),
  whtEur: z.string().optional(),
  ecbRate: z.string().optional(),
  broker: z.string().optional(),
  qty: z.string().optional(),
  costEur: z.string().optional(),
  proceedsEur: z.string().optional(),
  fingerprint: z.string(),
  formTarget: formTargetSchema.optional(),
});

const germanTaxDraftSchema: z.ZodType<GermanTaxDraft> = z.object({
  taxYear: z.number(),
  kap: z.object({
    Z4_guenstigerpruefung: z.boolean(),
    stockLossCarryforward: zeileValueSchema,
    lines: z.object({
      Z17: zeileValueSchema,
      Z19: zeileValueSchema,
      Z20: zeileValueSchema,
      Z22: zeileValueSchema,
      Z23: zeileValueSchema,
      Z41: zeileValueSchema,
      Z51: zeileValueSchema,
      Z52: zeileValueSchema,
    }),
  }),
  kapInv: z.object({
    present: z.boolean(),
    section1: z.object({
      Z4_aktienfonds: zeileValueSchema,
      Z5_mischfonds: zeileValueSchema,
      Z6_immo_inland: zeileValueSchema,
      Z7_immo_ausland: zeileValueSchema,
      Z8_sonstige: zeileValueSchema,
    }),
    section2: z.object({
      Z14_aktienfonds: zeileValueSchema,
      Z17_mischfonds: zeileValueSchema,
      Z20_immo_inland: zeileValueSchema,
      Z23_immo_ausland: zeileValueSchema,
      Z26_sonstige: zeileValueSchema,
    }),
  }),
  warnings: z.array(z.string()),
  evidence: z.array(kapEvidenceItemSchema),
});

const legacyGermanTaxDraftSchema: z.ZodType<LegacyGermanTaxDraft> = z.object({
  taxYear: z.number(),
  lines: z.object({
    Z19: z.string(),
    Z20: z.string(),
    Z21: z.string(),
    Z22: z.string(),
    Z41: z.string(),
    Z51: z.string(),
    Z52: z.string(),
  }),
  evidence: z.array(kapEvidenceItemSchema),
});

export const taxDataSchema: z.ZodType<TaxData> = z.object({
  year: z.number(),
  hero: z.object({
    netRealizedEur: z.number(),
    taxableBaseEur: z.number(),
    estTaxEur: z.number(),
  }),
  allowance: z.object({
    usedEur: z.number(),
    totalEur: z.number(),
    pct: z.number(),
    fxAdjustmentsEur: z.number(),
    whtPaidEur: z.number(),
    breakdown: z.object({
      dividendsEur: z.number(),
      realizedGainsEur: z.number(),
      interestEur: z.number(),
    }),
  }),
  forecast: z
    .object({
      asOfDate: z.string(),
      daysRemaining: z.number(),
      additionalDividendsEur: z.number(),
      usedEur: z.number(),
      pct: z.number(),
      taxableBaseEur: z.number(),
      estTaxEur: z.number(),
    })
    .nullable(),
  realizedLots: z.array(
    z.object({
      ticker: z.string(),
      broker: z.string(),
      method: z.string(),
      opened: z.string(),
      closed: z.string(),
      qty: z.number(),
      costEur: z.number(),
      proceedsEur: z.number(),
      gainEur: z.number(),
    }),
  ),
  kap: legacyGermanTaxDraftSchema,
  kapV2: germanTaxDraftSchema,
  reconciliation: z.object({
    rows: z.array(
      z.object({
        broker: z.string(),
        formTarget: z.string(),
        totalEur: z.number(),
        count: z.number(),
      }),
    ),
    excluded: z.array(z.string()),
    caveats: z.array(z.string()),
  }),
});

/** GET /api/tax/[year] response envelope. */
export const taxResponseSchema = z.object({
  tax: taxDataSchema,
  availableYears: z.array(z.number()),
});
export type TaxResponse = z.infer<typeof taxResponseSchema>;
