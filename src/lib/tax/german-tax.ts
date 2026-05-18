import Decimal from "decimal.js";
import { TREATY_CAP, DEFAULT_TREATY_CAP } from "./treaties";

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
};

export type GermanTaxDraft = {
  taxYear: number;
  lines: {
    Z19: string; // capital income gross (dividends + interest)
    Z20: string; // of which foreign
    Z21: string; // dummy placeholder, kept 0 for v1
    Z22: string; // of which gains from share sales (positive matches)
    Z41: string; // already-paid German Abgeltungsteuer (rare for foreign brokers)
    Z51: string; // foreign WHT paid (gross)
    Z52: string; // foreign WHT eligible for offset (treaty-capped)
  };
  evidence: KapEvidenceItem[];
};

export type BuildAnlageKapInput = {
  taxYear: number;
  settings: KapSettings;
  dividends: KapDividend[];
  interest: KapInterest[];
  matches: KapMatch[];
};

export function buildAnlageKap(input: BuildAnlageKapInput): GermanTaxDraft {
  const dividendGross = input.dividends.reduce((s, d) => s.plus(d.grossEur || "0"), new Decimal(0));
  const interestGross = input.interest.reduce((s, i) => s.plus(i.grossEur || "0"), new Decimal(0));
  const foreignDividends = input.dividends
    .filter(d => d.country && d.country !== "DE")
    .reduce((s, d) => s.plus(d.grossEur || "0"), new Decimal(0));
  const z19 = dividendGross.plus(interestGross);
  const z20 = foreignDividends; // interest assumed domestic in v1

  const positiveGains = input.matches.reduce((s, m) => s.plus(Decimal.max(0, new Decimal(m.gainEur || "0"))), new Decimal(0));
  const negativeGains = input.matches.reduce((s, m) => s.plus(Decimal.min(0, new Decimal(m.gainEur || "0"))), new Decimal(0));
  const z22 = positiveGains.plus(negativeGains); // net realized; negative losses reduce

  const z41 = new Decimal(0); // foreign brokers don't withhold DE AbgSt

  const whtTotal = input.dividends.reduce((s, d) => s.plus(d.whtEur || "0"), new Decimal(0));
  const eligibleWht = input.dividends.reduce((sum, d) => {
    const cap = d.country ? (TREATY_CAP[d.country] ?? DEFAULT_TREATY_CAP) : DEFAULT_TREATY_CAP;
    const grossDec = new Decimal(d.grossEur || "0");
    const whtDec = new Decimal(d.whtEur || "0");
    return sum.plus(Decimal.min(whtDec, grossDec.mul(cap)));
  }, new Decimal(0));

  return {
    taxYear: input.taxYear,
    lines: {
      Z19: z19.toFixed(2),
      Z20: z20.toFixed(2),
      Z21: "0.00",
      Z22: z22.toFixed(2),
      Z41: z41.toFixed(2),
      Z51: whtTotal.toFixed(2),
      Z52: eligibleWht.toFixed(2),
    },
    evidence: [
      ...input.dividends.map(d => ({
        date: input.taxYear.toString(),
        ticker: d.ticker,
        country: d.country,
        grossEur: d.grossEur,
        whtEur: d.whtEur,
        fingerprint: `div-${d.ticker}-${d.country ?? "??"}`,
      })),
      ...input.matches.map(m => ({
        date: m.closedAt,
        symbol: m.symbol,
        grossEur: m.gainEur,
        fingerprint: `match-${m.symbol}-${m.closedAt}`,
      })),
    ],
  };
}
