import Decimal from "decimal.js";
import { TREATY_CAP, DEFAULT_TREATY_CAP } from "./treaties";
import { guenstigerpruefungRecommended } from "./marginal-rate";
import { classifyKind, classifySector, fundSubtype, type FundSubtype, type AssetKind } from "@/lib/analytics/sector-map";

export type KapDividend = {
  ticker: string;
  /** ISIN when known — preferred classification key (symbols collide). */
  isin?: string;
  country?: string;
  grossEur: string;
  whtEur: string;
  /** Origin broker ("FF" | "IBKR" | …). Audit / reconciliation only (T5). */
  broker?: string;
};

export type KapInterest = { grossEur: string; broker?: string; description?: string };

export type KapMatch = {
  symbol: string;
  /** ISIN when known — preferred classification key (symbols collide). */
  isin?: string;
  gainEur: string;
  closedAt: string;
  broker?: string;
  /** Row-level FIFO detail for the audit trail (Finanzamt-facing evidence:
   *  the EUR-basis method legitimately diverges from broker USD summaries,
   *  so each match must be able to show its own cost/proceeds math). */
  qty?: string;
  costEur?: string;
  proceedsEur?: string;
};

/** Standalone WITHHOLDING_TAX events (T4). Some brokers (IBKR) report the
 *  foreign withholding tax in a dedicated section rather than inline on the
 *  dividend row, so it must be aggregated separately and matched back to the
 *  paying stock by symbol. */
export type KapWithholding = {
  symbol: string;
  /** ISIN when known — preferred classification key (symbols collide). */
  isin?: string;
  whtEur: string;
  country?: string;
  broker?: string;
};

export type KapSettings = {
  filingStatus: "SINGLE" | "JOINT";
  saverAllowance: string; // "1000" or "2000"
  /** Approximate annual taxable income (zvE, EUR) from Settings. Optional —
   *  personalizes the Zeile 4 Günstigerprüfung recommendation. */
  taxableIncomeEur?: string | null;
};

export type KapEvidenceItem = {
  date: string;
  symbol?: string;
  ticker?: string;
  country?: string;
  grossEur: string;
  whtEur?: string;
  ecbRate?: string;
  /** Origin broker, for the per-broker reconciliation subtotals (T5). */
  broker?: string;
  /** Row-level FIFO detail on realised-match rows: quantity, EUR cost at
   *  buy-date FX, EUR proceeds at sale-date FX. Lets a Finanzamt query be
   *  answered line by line when our numbers differ from broker summaries. */
  qty?: string;
  costEur?: string;
  proceedsEur?: string;
  fingerprint: string;
  /** Which ELSTER form + line this row feeds. Audit aid. */
  formTarget?: FormTarget;
};

// Anlage KAP 2025 line layout (verified against the official 2025 Formular /
// ELSTER help; Zeile 21 was removed for 2025 with the derivatives loss cap):
//   Z19 — Ausländische Kapitalerträge (foreign capital-income TOTAL)
//   Z20 — darin enthaltene Gewinne aus Aktienveräußerungen (§20 Abs.2 Nr.1)
//   Z22 — darin enthaltene Verluste OHNE Verluste aus Aktienveräußerungen
//   Z23 — darin enthaltene Verluste AUS Aktienveräußerungen (§20 Abs.6 bucket)
//   Z51/Z52 — ausländische Quellensteuer (brutto / anrechenbar).
// Sources: privatsparer.de "Anlage KAP 2025 · Interactive Brokers"; steuern.de.
export type FormTarget =
  | "KAP_Z19" | "KAP_Z20" | "KAP_Z22" | "KAP_Z23" | "KAP_Z51" | "KAP_Z52"
  | "KAP_INV_S1_Z4" | "KAP_INV_S1_Z5" | "KAP_INV_S1_Z6" | "KAP_INV_S1_Z7" | "KAP_INV_S1_Z8"
  | "KAP_INV_S2_Z14" | "KAP_INV_S2_Z17" | "KAP_INV_S2_Z20" | "KAP_INV_S2_Z23" | "KAP_INV_S2_Z26";

/** Both representations of one Zeile's amount.
 *  - `cents`: signed decimal string with 2 decimals (audit/internal arithmetic)
 *  - `euros`: integer ELSTER value (half-up rounded, clamped to ≥ 0 where the form requires it) */
export type ZeileValue = { cents: string; euros: number };

export type GermanTaxDraft = {
  taxYear: number;
  kap: {
    /** Zeile 4 — "Antrag auf Günstigerprüfung für sämtliche Kapitalerträge".
     *  ALWAYS false: the app never requests it. Only worthwhile when the
     *  personal marginal rate is below 25 %; if ticked, ALL capital income
     *  must be declared. (Attaching Anlage KAP-INV is NOT a KAP checkbox —
     *  it happens by adding the form to the ELSTER form list; see
     *  `kapInv.present`. Earlier versions mislabeled this line.) */
    Z4_guenstigerpruefung: boolean;
    /** Positive net stock-sale loss (Z23 − Z20, floored at 0). Informational,
     *  not an ELSTER line: when > 0, the filer should tick "Erklärung zur
     *  Feststellung des verbleibenden Verlustvortrags" on the Hauptvordruck
     *  so the unused Aktien loss carries forward (§20 Abs. 6 S. 4 EStG:
     *  stock losses only ever offset stock gains). */
    stockLossCarryforward: ZeileValue;
    lines: {
      Z17: ZeileValue; // Sparer-Pauschbetrag against non-KAP income (always 0 — let ELSTER auto-allocate)
      Z19: ZeileValue; // Ausländische Kapitalerträge — total (non-fund dividends + interest + positive realised gains)
      Z20: ZeileValue; // darin: Gewinne aus Aktienveräußerungen (stock-sale gains, ≥ 0)
      Z22: ZeileValue; // darin: Verluste ohne Aktienveräußerungen (bond/other losses, ≥ 0 magnitude)
      Z23: ZeileValue; // darin: Verluste aus Aktienveräußerungen (stock-sale losses, ≥ 0 magnitude)
      Z41: ZeileValue; // already-paid German AbgSt (always 0 for foreign brokers)
      Z51: ZeileValue; // foreign WHT paid (gross)
      Z52: ZeileValue; // foreign WHT eligible for offset (treaty-capped)
    };
  };
  kapInv: {
    /** True iff any KAP-INV line has non-zero cents. When true the filer
     *  must ADD Anlage KAP-INV to the ELSTER form list (there is no KAP
     *  checkbox for this). Drives page-3 rendering. */
    present: boolean;
    section1: {
      Z4_aktienfonds: ZeileValue;
      Z5_mischfonds: ZeileValue;
      Z6_immo_inland: ZeileValue;
      Z7_immo_ausland: ZeileValue;
      Z8_sonstige: ZeileValue;
    };
    section2: {
      Z14_aktienfonds: ZeileValue;
      Z17_mischfonds: ZeileValue;
      Z20_immo_inland: ZeileValue;
      Z23_immo_ausland: ZeileValue;
      Z26_sonstige: ZeileValue;
    };
  };
  warnings: string[];
  evidence: KapEvidenceItem[];
};

export type BuildAnlageKapInput = {
  taxYear: number;
  settings: KapSettings;
  dividends: KapDividend[];
  interest: KapInterest[];
  matches: KapMatch[];
  /** Standalone WITHHOLDING_TAX events (T4). Applied to Z51/Z52 only for
   *  STOCK symbols whose dividend rows carry NO inline whtEur — this avoids
   *  double-counting brokers (FF) that stamp WHT both inline and as a tax
   *  row. ETF/fund WHT is never routed here (not investor-creditable under
   *  InvStG 2018) — it only produces a warning. */
  withholding?: KapWithholding[];
  /** Per-symbol classification override (T-wire). Consulted BEFORE the
   *  hardcoded sector/subtype maps, so enriched instrument_meta (e.g. a US
   *  equity ETF resolved to kind:"etf") reroutes correctly. `subtype: null`
   *  falls through to FUND_SUBTYPE_MAP. Keeps the builder pure — the
   *  override is just data in its input. Keys are symbols AND ISINs. */
  classification?: Record<
    string,
    { kind: AssetKind; subtype: FundSubtype | null; accumulating?: boolean }
  >;
  /** Vorabpauschale guard (§18/§19 InvStG): accumulating funds detected by
   *  the loader. `heldAtPriorYearEnd` — held on 31.12.(taxYear−1), so their
   *  Vorabpauschale is income of THIS tax year (Zufluss: first working day)
   *  and is missing from foreign-broker data. `soldInYear` — their FIFO
   *  gain must be reduced by previously taxed Vorabpauschalen. v1 emits
   *  warnings only; docs/vorabpauschale-design.md describes the full v2. */
  accumulatingFunds?: { heldAtPriorYearEnd: string[]; soldInYear: string[] };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ZERO = (): ZeileValue => ({ cents: "0.00", euros: 0 });

function toZeile(d: Decimal, clampNonNeg = false): ZeileValue {
  const value = clampNonNeg && d.lt(0) ? new Decimal(0) : d;
  return {
    cents: value.toFixed(2),
    // Half-up rounding to whole euros. Decimal.ROUND_HALF_UP = 0.
    euros: Number(value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString()),
  };
}

function isNonZero(z: ZeileValue): boolean {
  return new Decimal(z.cents).abs().gt(0);
}

type ClassificationMap = BuildAnlageKapInput["classification"];

/** Subtype resolution order (T1): ISIN-keyed classification → symbol-keyed
 *  classification → FUND_SUBTYPE_MAP → "unknown" (routes to Z8_sonstige +
 *  warning). A `null` override subtype still falls through to the hardcoded
 *  map (e.g. US ETFs SPY/VOO/SCHD, which justETF can't classify but are
 *  Aktienfonds per §2 Abs.6 InvStG). */
function subtypeFor(
  ticker: string,
  classification?: ClassificationMap,
  isin?: string,
): FundSubtype | "unknown" {
  const override = (isin ? classification?.[isin] : undefined) ?? classification?.[ticker];
  if (override?.subtype) return override.subtype;
  return fundSubtype(ticker);
}

/** Kind resolution: ISIN-keyed classification → symbol-keyed classification
 *  → the hardcoded classifyKind() fallback. ISIN comes FIRST because ticker
 *  symbols collide across listings — the user's real portfolio has Citigroup
 *  common stock (US1729674242) and a Citigroup bond (US172967MZ11) BOTH
 *  under symbol "C"; only the ISIN separates §20 Aktien losses (Z23) from
 *  sonstige losses (Z22). */
function kindFor(
  ticker: string,
  classification?: ClassificationMap,
  isin?: string,
): AssetKind {
  const override = (isin ? classification?.[isin] : undefined) ?? classification?.[ticker];
  if (override) return override.kind;
  return classifyKind(ticker, classifySector(ticker));
}

// Section-1 lookup by fund subtype.
const SECTION1_KEY: Record<FundSubtype, keyof GermanTaxDraft["kapInv"]["section1"]> = {
  aktien: "Z4_aktienfonds",
  misch: "Z5_mischfonds",
  immo_inland: "Z6_immo_inland",
  immo_ausland: "Z7_immo_ausland",
  sonstige: "Z8_sonstige",
};
const SECTION2_KEY: Record<FundSubtype, keyof GermanTaxDraft["kapInv"]["section2"]> = {
  aktien: "Z14_aktienfonds",
  misch: "Z17_mischfonds",
  immo_inland: "Z20_immo_inland",
  immo_ausland: "Z23_immo_ausland",
  sonstige: "Z26_sonstige",
};
const SECTION1_FORM_TARGET: Record<FundSubtype, FormTarget> = {
  aktien: "KAP_INV_S1_Z4",
  misch: "KAP_INV_S1_Z5",
  immo_inland: "KAP_INV_S1_Z6",
  immo_ausland: "KAP_INV_S1_Z7",
  sonstige: "KAP_INV_S1_Z8",
};
const SECTION2_FORM_TARGET: Record<FundSubtype, FormTarget> = {
  aktien: "KAP_INV_S2_Z14",
  misch: "KAP_INV_S2_Z17",
  immo_inland: "KAP_INV_S2_Z20",
  immo_ausland: "KAP_INV_S2_Z23",
  sonstige: "KAP_INV_S2_Z26",
};

// ---------------------------------------------------------------------------
// buildKapAndKapInv — primary entry point
// ---------------------------------------------------------------------------

export function buildKapAndKapInv(input: BuildAnlageKapInput): GermanTaxDraft {
  const cls = input.classification;
  const section1 = {
    aktien: new Decimal(0),
    misch: new Decimal(0),
    immo_inland: new Decimal(0),
    immo_ausland: new Decimal(0),
    sonstige: new Decimal(0),
  };
  const section2 = {
    aktien: new Decimal(0),
    misch: new Decimal(0),
    immo_inland: new Decimal(0),
    immo_ausland: new Decimal(0),
    sonstige: new Decimal(0),
  };
  const warnings: string[] = [];
  const evidence: KapEvidenceItem[] = [];

  // KAP running totals. Losses are accumulated as POSITIVE magnitudes in
  // their own Zeilen (Z22/Z23) so no emitted value is ever negative — the
  // §20 Abs.6 loss buckets are enforced by the Finanzamt from these split
  // lines, not by a single net figure. Z19 is the positive foreign-income
  // TOTAL (dividends + interest + positive realised gains); the Z20 stock-
  // gains breakout is a subset of it ("darin enthalten").
  //
  // NOTE FOR HUMAN REVIEW: the exact netting the Finanzamt expects between
  // Z19 and the Z20/Z22/Z23 breakouts is a Steuerberater question — we keep
  // every magnitude auditable and non-negative rather than pre-netting.
  let z19 = new Decimal(0);         // Ausländische Kapitalerträge (total)
  let stockGains = new Decimal(0);  // Z20 — Gewinne aus Aktienveräußerungen
  let stockLosses = new Decimal(0); // Z23 — Verluste aus Aktienveräußerungen
  let otherLosses = new Decimal(0); // Z22 — Verluste ohne Aktienveräußerungen
  let z51 = new Decimal(0);
  let z52 = new Decimal(0);

  // Stock-dividend totals keyed by (broker, symbol), used to match standalone
  // WHT (T4). The broker dimension matters: a symbol held at BOTH brokers can
  // carry inline WHT at one (FF) and a standalone WITHHOLDING_TAX event at the
  // other (IBKR); keying by symbol alone would let the FF inline suppress the
  // legitimate IBKR standalone credit.
  const brokerKey = (broker: string | undefined, symbol: string) => `${broker ?? "?"}|${symbol}`;
  const stockDiv = new Map<string, { gross: Decimal; country?: string; inlineWht: Decimal }>();

  // --- Dividends ---------------------------------------------------------
  for (const d of input.dividends) {
    const kind = kindFor(d.ticker, cls, d.isin);
    const gross = new Decimal(d.grossEur || "0");
    const wht = new Decimal(d.whtEur || "0");

    if (kind === "etf") {
      const sub = subtypeFor(d.ticker, cls, d.isin);
      const resolved: FundSubtype = sub === "unknown" ? "sonstige" : sub;
      if (sub === "unknown") {
        warnings.push(
          `Unknown ETF "${d.ticker}" — defaulted to Sonstige (0% Teilfreistellung). Verify with your Steuerberater and add the symbol to FUND_SUBTYPE_MAP.`,
        );
      }
      if (wht.gt(0)) {
        warnings.push(
          `ETF "${d.ticker}" had foreign WHT (€${wht.toFixed(2)}). Under InvStG 2018 fund-distribution WHT is not investor-creditable (Teilfreistellung compensates) — not routed to KAP Z51/Z52.`,
        );
      }
      section1[resolved] = section1[resolved].plus(gross);
      evidence.push({
        date: input.taxYear.toString(),
        ticker: d.ticker,
        country: d.country,
        grossEur: d.grossEur,
        whtEur: d.whtEur,
        broker: d.broker,
        fingerprint: `div-${d.ticker}-${d.country ?? "??"}`,
        formTarget: SECTION1_FORM_TARGET[resolved],
      });
    } else {
      // stock / bond / other → KAP Z19 total
      if (kind === "other") {
        warnings.push(
          `Dividend on "${d.ticker}" has unclassifiable asset kind — routed to KAP Z19. Verify with your Steuerberater.`,
        );
      }
      z19 = z19.plus(gross);
      z51 = z51.plus(wht);
      // Treaty-capped Z52
      const cap = d.country ? (TREATY_CAP[d.country] ?? DEFAULT_TREATY_CAP) : DEFAULT_TREATY_CAP;
      z52 = z52.plus(Decimal.min(wht, gross.mul(cap)));
      const dk = brokerKey(d.broker, d.ticker);
      const prev = stockDiv.get(dk);
      stockDiv.set(dk, {
        gross: (prev?.gross ?? new Decimal(0)).plus(gross),
        country: prev?.country ?? d.country,
        inlineWht: (prev?.inlineWht ?? new Decimal(0)).plus(wht),
      });
      evidence.push({
        date: input.taxYear.toString(),
        ticker: d.ticker,
        country: d.country,
        grossEur: d.grossEur,
        whtEur: d.whtEur,
        broker: d.broker,
        fingerprint: `div-${d.ticker}-${d.country ?? "??"}`,
        formTarget: "KAP_Z19",
      });
    }
  }

  // --- Interest (always non-fund → KAP Z19) ------------------------------
  // Negative interest = DEBIT (margin) interest the investor PAID. Under
  // §20 Abs. 9 EStG actual expenses are NOT deductible from capital income
  // (only the Sparer-Pauschbetrag is) — so paid interest must not reduce
  // Z19. Excluded with a warning instead of silently netted.
  for (const i of input.interest) {
    const gross = new Decimal(i.grossEur || "0");
    if (gross.lt(0)) {
      warnings.push(
        `Debit/margin interest of €${gross.abs().toFixed(2)}${i.broker ? ` (${i.broker})` : ""} is not deductible under §20 Abs. 9 EStG — excluded from KAP Z19.`,
      );
      continue;
    }
    z19 = z19.plus(gross);
  }

  // --- Standalone withholding tax (T4) -----------------------------------
  // Some brokers (IBKR) report WHT in a dedicated section, not inline on the
  // dividend. Aggregate per (broker, symbol); apply to Z51/Z52 only for STOCK
  // symbols whose SAME-broker dividend carries NO inline WHT (prefer the inline
  // field — FF stamps WHT both inline and as a tax row, so blindly adding
  // double-counts). Matching per broker keeps a symbol held at two brokers from
  // having one broker's inline WHT suppress the other's standalone credit.
  const standalone = new Map<string, { wht: Decimal; symbol: string; broker?: string; country?: string }>();
  for (const w of input.withholding ?? []) {
    const amt = new Decimal(w.whtEur || "0");
    if (amt.lte(0)) continue;
    if (kindFor(w.symbol, cls, w.isin) === "etf") {
      warnings.push(
        `ETF/fund WHT on "${w.symbol}" (€${amt.toFixed(2)}) is not investor-creditable under InvStG 2018 — excluded from KAP Z51/Z52.`,
      );
      continue;
    }
    const wk = brokerKey(w.broker, w.symbol);
    const prev = standalone.get(wk);
    standalone.set(wk, {
      wht: (prev?.wht ?? new Decimal(0)).plus(amt),
      symbol: w.symbol,
      broker: prev?.broker ?? w.broker,
      country: prev?.country ?? w.country,
    });
  }
  for (const [wk, agg] of standalone) {
    const div = stockDiv.get(wk); // same (broker, symbol)
    if (div && div.inlineWht.gt(0)) continue; // already reflected inline for THIS broker — skip
    z51 = z51.plus(agg.wht);
    if (div) {
      const country = div.country ?? agg.country;
      const cap = country ? (TREATY_CAP[country] ?? DEFAULT_TREATY_CAP) : DEFAULT_TREATY_CAP;
      z52 = z52.plus(Decimal.min(agg.wht, div.gross.mul(cap)));
    } else {
      warnings.push(
        `Withholding tax on "${agg.symbol}"${agg.broker ? ` (${agg.broker})` : ""} (€${agg.wht.toFixed(2)}) couldn't be matched to a same-broker dividend — added to KAP Z51 but not Z52 (creditability unverified). Verify with your Steuerberater.`,
      );
    }
  }

  // --- Realised matches --------------------------------------------------
  for (const m of input.matches) {
    const kind = kindFor(m.symbol, cls, m.isin);
    const gain = new Decimal(m.gainEur || "0");
    if (kind === "etf") {
      const sub = subtypeFor(m.symbol, cls, m.isin);
      const resolved: FundSubtype = sub === "unknown" ? "sonstige" : sub;
      if (sub === "unknown") {
        warnings.push(
          `Unknown ETF match "${m.symbol}" — defaulted to Sonstige (0% Teilfreistellung).`,
        );
      }
      section2[resolved] = section2[resolved].plus(gain);
      evidence.push({
        date: m.closedAt,
        symbol: m.symbol,
        grossEur: m.gainEur,
        broker: m.broker,
        qty: m.qty,
        costEur: m.costEur,
        proceedsEur: m.proceedsEur,
        fingerprint: `match-${m.symbol}-${m.closedAt}`,
        formTarget: SECTION2_FORM_TARGET[resolved],
      });
    } else if (kind === "stock") {
      // Aktien (§20 Abs.2 Nr.1): gains → Z20, losses → Z23 (own §20 Abs.6 bucket).
      if (gain.gte(0)) {
        stockGains = stockGains.plus(gain);
        z19 = z19.plus(gain);
      } else {
        stockLosses = stockLosses.plus(gain.abs());
      }
      evidence.push({
        date: m.closedAt,
        symbol: m.symbol,
        grossEur: m.gainEur,
        broker: m.broker,
        qty: m.qty,
        costEur: m.costEur,
        proceedsEur: m.proceedsEur,
        fingerprint: `match-${m.symbol}-${m.closedAt}`,
        formTarget: gain.gte(0) ? "KAP_Z20" : "KAP_Z23",
      });
    } else {
      // bond / other: gains feed the Z19 total; losses → Z22 (non-Aktien bucket).
      if (gain.gte(0)) {
        z19 = z19.plus(gain);
      } else {
        otherLosses = otherLosses.plus(gain.abs());
      }
      evidence.push({
        date: m.closedAt,
        symbol: m.symbol,
        grossEur: m.gainEur,
        broker: m.broker,
        qty: m.qty,
        costEur: m.costEur,
        proceedsEur: m.proceedsEur,
        fingerprint: `match-${m.symbol}-${m.closedAt}`,
        formTarget: gain.gte(0) ? "KAP_Z19" : "KAP_Z22",
      });
    }
  }

  // --- Build KAP-INV ZeileValues with negative-clamp + warnings ---------
  // Section 2 (fund sale gains) is clamped ≥ 0 too: a net fund-sale loss
  // within a subtype can't produce a negative ELSTER value — it warns and
  // carries forward instead.
  const section1Out = {
    Z4_aktienfonds: toZeile(section1.aktien, true),
    Z5_mischfonds: toZeile(section1.misch, true),
    Z6_immo_inland: toZeile(section1.immo_inland, true),
    Z7_immo_ausland: toZeile(section1.immo_ausland, true),
    Z8_sonstige: toZeile(section1.sonstige, true),
  };
  const section2Out = {
    Z14_aktienfonds: toZeile(section2.aktien, true),
    Z17_mischfonds: toZeile(section2.misch, true),
    Z20_immo_inland: toZeile(section2.immo_inland, true),
    Z23_immo_ausland: toZeile(section2.immo_ausland, true),
    Z26_sonstige: toZeile(section2.sonstige, true),
  };
  for (const key of Object.keys(section1) as (keyof typeof section1)[]) {
    if (section1[key].lt(0)) {
      warnings.push(
        `Negative fund-distribution total in ${SECTION1_FORM_TARGET[key]} (${section1[key].toFixed(2)} €). ELSTER rejects negative values here — verify the source and carry forward instead.`,
      );
    }
  }
  for (const key of Object.keys(section2) as (keyof typeof section2)[]) {
    if (section2[key].lt(0)) {
      warnings.push(
        `Net fund-sale loss in ${SECTION2_FORM_TARGET[key]} (${section2[key].toFixed(2)} €). Clamped to 0 for ELSTER — verify the loss carry-forward with your Steuerberater.`,
      );
    }
  }

  // --- Vorabpauschale guard (§18/§19 InvStG) ------------------------------
  // Accumulating funds owe tax on a fictitious minimum yield every year —
  // income foreign brokers neither report nor withhold, so it can never be
  // derived from the statement alone. v1 refuses to stay silent: every
  // affected number carries a loud, specific warning. Full computation is
  // designed in docs/vorabpauschale-design.md (needs year-boundary NAVs +
  // a per-lot ledger for the §19 sale reduction).
  const priorYear = input.taxYear - 1;
  for (const sym of input.accumulatingFunds?.heldAtPriorYearEnd ?? []) {
    warnings.push(
      `"${sym}" is an ACCUMULATING fund held on 31.12.${priorYear}. Its Vorabpauschale for ${priorYear} `
      + `is taxable income of ${input.taxYear} (§18 InvStG — deemed received on the first working day) and is `
      + `NOT included in this draft. Compute it (Jan-1 value × Basiszins(${priorYear}) × 0.7, capped at the `
      + `year's value gain) and enter it on Anlage KAP-INV in the Vorabpauschale block for its fund type.`,
    );
  }
  for (const sym of input.accumulatingFunds?.soldInYear ?? []) {
    warnings.push(
      `"${sym}" is an ACCUMULATING fund sold in ${input.taxYear}. §19 InvStG: reduce the sale gain by the `
      + `Vorabpauschalen already taxed in prior holding years — this draft shows the UNREDUCED FIFO gain. `
      + `Verify with your Steuerberater before filing.`,
    );
  }

  const kapInvPresent =
    isNonZero(section1Out.Z4_aktienfonds)
    || isNonZero(section1Out.Z5_mischfonds)
    || isNonZero(section1Out.Z6_immo_inland)
    || isNonZero(section1Out.Z7_immo_ausland)
    || isNonZero(section1Out.Z8_sonstige)
    || isNonZero(section2Out.Z14_aktienfonds)
    || isNonZero(section2Out.Z17_mischfonds)
    || isNonZero(section2Out.Z20_immo_inland)
    || isNonZero(section2Out.Z23_immo_ausland)
    || isNonZero(section2Out.Z26_sonstige);

  return {
    taxYear: input.taxYear,
    kap: {
      // Recommended only when the user's §32a marginal rate (from the
      // optional taxable-income setting) is below the 25 % Abgeltungsteuer.
      // Unknown income ⇒ false: requesting it obliges declaring ALL
      // capital income, so the conservative default is "don't".
      Z4_guenstigerpruefung: guenstigerpruefungRecommended(
        input.settings.taxableIncomeEur != null ? Number(input.settings.taxableIncomeEur) : null,
        input.settings.filingStatus,
      ),
      // §20 Abs. 6 S. 4: unused stock losses only carry forward against
      // future stock gains — surface the amount so the filer ticks the
      // Verlustfeststellung on the Hauptvordruck instead of losing it.
      stockLossCarryforward: toZeile(Decimal.max(0, stockLosses.minus(stockGains))),
      lines: {
        Z17: ZERO(),                       // always 0 — let ELSTER auto-allocate the Pauschbetrag
        Z19: toZeile(z19, true),           // Ausländische Kapitalerträge (total)
        Z20: toZeile(stockGains, true),    // darin: Gewinne aus Aktienveräußerungen
        Z22: toZeile(otherLosses, true),   // darin: Verluste ohne Aktienveräußerungen (magnitude)
        Z23: toZeile(stockLosses, true),   // darin: Verluste aus Aktienveräußerungen (magnitude)
        Z41: ZERO(),                       // foreign brokers don't withhold DE AbgSt
        Z51: toZeile(z51, true),
        Z52: toZeile(z52, true),
      },
    },
    kapInv: {
      present: kapInvPresent,
      section1: section1Out,
      section2: section2Out,
    },
    warnings,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// Back-compat shim: keep buildAnlageKap returning the OLD shape so the
// PDF/CSV/UI callers can be migrated independently. Will be removed once
// all consumers move to the new draft shape.
// ---------------------------------------------------------------------------

export type LegacyGermanTaxDraft = {
  taxYear: number;
  lines: {
    Z19: string;
    Z20: string;
    Z21: string;
    Z22: string;
    Z41: string;
    Z51: string;
    Z52: string;
  };
  evidence: KapEvidenceItem[];
};

export function buildAnlageKap(input: BuildAnlageKapInput): LegacyGermanTaxDraft {
  const d = buildKapAndKapInv(input);
  return {
    taxYear: d.taxYear,
    // Legacy shape collapsed: ALL dividends + interest in Z19 (back-compat).
    // Once the PDF/UI/CSV migrate to the new draft, this shim goes away.
    lines: {
      Z19: legacyZ19(input).toFixed(2),
      Z20: legacyForeign(input).toFixed(2),
      Z21: "0.00",
      Z22: legacyZ22(input).toFixed(2),
      Z41: "0.00",
      Z51: d.kap.lines.Z51.cents,
      Z52: d.kap.lines.Z52.cents,
    },
    evidence: d.evidence,
  };
}

function legacyZ19(input: BuildAnlageKapInput): Decimal {
  const div = input.dividends.reduce((s, d) => s.plus(d.grossEur || "0"), new Decimal(0));
  const int = input.interest.reduce((s, i) => s.plus(i.grossEur || "0"), new Decimal(0));
  return div.plus(int);
}

function legacyForeign(input: BuildAnlageKapInput): Decimal {
  return input.dividends
    .filter((d) => d.country && d.country !== "DE")
    .reduce((s, d) => s.plus(d.grossEur || "0"), new Decimal(0));
}

function legacyZ22(input: BuildAnlageKapInput): Decimal {
  return input.matches.reduce((s, m) => s.plus(new Decimal(m.gainEur || "0")), new Decimal(0));
}
