import Decimal from "decimal.js";
import { TREATY_CAP, DEFAULT_TREATY_CAP } from "./treaties";
import { classifyKind, classifySector, fundSubtype, type FundSubtype } from "@/lib/analytics/sector-map";

export type KapDividend = {
  ticker: string;
  country?: string;
  grossEur: string;
  whtEur: string;
};

export type KapInterest = { grossEur: string };

export type KapMatch = {
  symbol: string;
  gainEur: string;
  closedAt: string;
};

export type KapSettings = {
  filingStatus: "SINGLE" | "JOINT";
  saverAllowance: string; // "1000" or "2000"
};

export type KapEvidenceItem = {
  date: string;
  symbol?: string;
  ticker?: string;
  country?: string;
  grossEur: string;
  whtEur?: string;
  ecbRate?: string;
  fingerprint: string;
  /** Which ELSTER form + line this row feeds. Audit aid. */
  formTarget?: FormTarget;
};

export type FormTarget =
  | "KAP_Z17" | "KAP_Z19" | "KAP_Z20" | "KAP_Z22" | "KAP_Z41" | "KAP_Z51" | "KAP_Z52"
  | "KAP_INV_S1_Z4" | "KAP_INV_S1_Z5" | "KAP_INV_S1_Z6" | "KAP_INV_S1_Z7" | "KAP_INV_S1_Z8"
  | "KAP_INV_S2_Z14" | "KAP_INV_S2_Z17" | "KAP_INV_S2_Z20" | "KAP_INV_S2_Z23" | "KAP_INV_S2_Z26";

/** Both representations of one Zeile's amount.
 *  - `cents`: signed decimal string with 2 decimals (audit/internal arithmetic)
 *  - `euros`: integer ELSTER value (half-up rounded, clamped to ≥ 0 where the form requires it) */
export type ZeileValue = { cents: string; euros: number };

export type GermanTaxDraft = {
  taxYear: number;
  kap: {
    /** Checkbox Zeile 4: "Anlage KAP-INV beigefügt". True iff kapInv.present. */
    Z4_kapInvAttached: boolean;
    lines: {
      Z17: ZeileValue; // Sparer-Pauschbetrag against non-KAP income (always 0 — let ELSTER auto-allocate)
      Z19: ZeileValue; // capital income gross (NON-fund dividends + interest)
      Z20: ZeileValue; // of which foreign
      Z22: ZeileValue; // gains from share sales (positive matches, single stocks only)
      Z41: ZeileValue; // already-paid German AbgSt (always 0 for foreign brokers)
      Z51: ZeileValue; // foreign WHT paid (gross)
      Z52: ZeileValue; // foreign WHT eligible for offset (treaty-capped)
    };
  };
  kapInv: {
    /** True iff any KAP-INV line has non-zero cents. Drives KAP Z4 checkbox + page-3 rendering. */
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

function subtypeFor(ticker: string): FundSubtype | "unknown" {
  return fundSubtype(ticker);
}

function kindFor(ticker: string) {
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
  // Per-form running totals as Decimal — we convert to ZeileValue at the end.
  const kapZ19 = new Decimal(0);
  const kapZ20 = new Decimal(0);
  const kapZ51 = new Decimal(0);
  const kapZ52 = new Decimal(0);
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

  // We accumulate KAP Z19/Z20 in scoped vars below by reassigning local
  // Decimals. (Decimal is immutable per-op.)
  let z19 = kapZ19;
  let z20 = kapZ20;
  let z51 = kapZ51;
  let z52 = kapZ52;

  // --- Dividends ---------------------------------------------------------
  for (const d of input.dividends) {
    const kind = kindFor(d.ticker);
    const gross = new Decimal(d.grossEur || "0");
    const wht = new Decimal(d.whtEur || "0");
    const isForeign = d.country && d.country !== "DE";

    if (kind === "etf") {
      const sub = subtypeFor(d.ticker);
      const resolved: FundSubtype = sub === "unknown" ? "sonstige" : sub;
      if (sub === "unknown") {
        warnings.push(
          `Unknown ETF "${d.ticker}" — defaulted to Sonstige (0% Teilfreistellung). Verify with your Steuerberater and add the symbol to FUND_SUBTYPE_MAP.`,
        );
      }
      if (wht.gt(0)) {
        warnings.push(
          `ETF "${d.ticker}" had foreign WHT (€${wht.toFixed(2)}). v1 doesn't route ETF WHT to KAP-INV Z41 — credit manually if eligible.`,
        );
      }
      section1[resolved] = section1[resolved].plus(gross);
      evidence.push({
        date: input.taxYear.toString(),
        ticker: d.ticker,
        country: d.country,
        grossEur: d.grossEur,
        whtEur: d.whtEur,
        fingerprint: `div-${d.ticker}-${d.country ?? "??"}`,
        formTarget: SECTION1_FORM_TARGET[resolved],
      });
    } else {
      // stock / bond / other → KAP Z19/Z20
      if (kind === "other") {
        warnings.push(
          `Dividend on "${d.ticker}" has unclassifiable asset kind — routed to KAP Z19. Verify with your Steuerberater.`,
        );
      }
      z19 = z19.plus(gross);
      if (isForeign) z20 = z20.plus(gross);
      z51 = z51.plus(wht);
      // Treaty-capped Z52
      const cap = d.country ? (TREATY_CAP[d.country] ?? DEFAULT_TREATY_CAP) : DEFAULT_TREATY_CAP;
      z52 = z52.plus(Decimal.min(wht, gross.mul(cap)));
      evidence.push({
        date: input.taxYear.toString(),
        ticker: d.ticker,
        country: d.country,
        grossEur: d.grossEur,
        whtEur: d.whtEur,
        fingerprint: `div-${d.ticker}-${d.country ?? "??"}`,
        formTarget: "KAP_Z19",
      });
    }
  }

  // --- Interest (always non-fund → KAP Z19) ------------------------------
  for (const i of input.interest) {
    z19 = z19.plus(new Decimal(i.grossEur || "0"));
  }

  // --- Realised matches --------------------------------------------------
  let kapZ22 = new Decimal(0);
  for (const m of input.matches) {
    const kind = kindFor(m.symbol);
    const gain = new Decimal(m.gainEur || "0");
    if (kind === "etf") {
      const sub = subtypeFor(m.symbol);
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
        fingerprint: `match-${m.symbol}-${m.closedAt}`,
        formTarget: SECTION2_FORM_TARGET[resolved],
      });
    } else {
      kapZ22 = kapZ22.plus(gain);
      evidence.push({
        date: m.closedAt,
        symbol: m.symbol,
        grossEur: m.gainEur,
        fingerprint: `match-${m.symbol}-${m.closedAt}`,
        formTarget: "KAP_Z22",
      });
    }
  }

  // --- Build KAP-INV ZeileValues with negative-clamp + warnings ---------
  // Map subtype keys back to the section1/section2 field-name keys.
  const section1Out = {
    Z4_aktienfonds: toZeile(section1.aktien, true),
    Z5_mischfonds: toZeile(section1.misch, true),
    Z6_immo_inland: toZeile(section1.immo_inland, true),
    Z7_immo_ausland: toZeile(section1.immo_ausland, true),
    Z8_sonstige: toZeile(section1.sonstige, true),
  };
  const section2Out = {
    Z14_aktienfonds: toZeile(section2.aktien),
    Z17_mischfonds: toZeile(section2.misch),
    Z20_immo_inland: toZeile(section2.immo_inland),
    Z23_immo_ausland: toZeile(section2.immo_ausland),
    Z26_sonstige: toZeile(section2.sonstige),
  };
  for (const key of Object.keys(section1) as (keyof typeof section1)[]) {
    if (section1[key].lt(0)) {
      warnings.push(
        `Negative fund-distribution total in ${SECTION1_FORM_TARGET[key]} (${section1[key].toFixed(2)} €). ELSTER rejects negative values here — verify the source and carry forward instead.`,
      );
    }
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
      Z4_kapInvAttached: kapInvPresent,
      lines: {
        Z17: ZERO(),                       // always 0 — let ELSTER auto-allocate the Pauschbetrag
        Z19: toZeile(z19, true),
        Z20: toZeile(z20, true),
        Z22: toZeile(kapZ22),              // can be negative (net realised loss)
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
