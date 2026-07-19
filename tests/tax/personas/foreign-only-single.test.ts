/**
 * PERSONA: unmarried, no church tax, foreign brokers only, above 25 % marginal
 * rate. Plain shares plus equity ETFs, one bond sold at a loss, one German
 * savings certificate.
 *
 * The expectations below are NOT our arithmetic — they are what ELSTER itself
 * computed on 2026-07-19 from these exact inputs:
 *
 *   Kapitalerträge                        364
 *   Gewinne aus Veräußerung von Aktien    586
 *   Investmenterträge                     352
 *   Zwischensumme                       1.302
 *   Einkünfte i.S.d. § 32d Abs. 1 EStG        0
 *   nicht ausgleichsfähige Verluste     1.642
 *
 * ELSTER's own Zwischensumme bakes in a Vorabpauschale of €9 that this
 * taxpayer typed into ELSTER section 4 for the year. Folio does NOT compute
 * Vorabpauschale (that is Plan 5, not yet built), so it cannot be an
 * assertion on `draft.*` — it is represented below as an explicit external
 * constant, reconciled against Folio's real output. See the Zwischensumme
 * test for the boundary.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { buildKapAndKapInv } from "@/lib/tax/german-tax";
import { buildInputs, dividend, interest, match, ACCT } from "../kap-fixtures";

const STOCK = { kind: "stock" as const, subtype: null };
const AKTIENFONDS = { kind: "etf" as const, subtype: "aktien" as const };

function persona() {
  return buildKapAndKapInv({
    ...buildInputs(
      [
        dividend({ brokerAccountId: ACCT.ff, symbol: "GM", amountEur: "297.73" }),
        interest({ brokerAccountId: ACCT.ibkr, amountEur: "33.30" }),
        dividend({ brokerAccountId: ACCT.ff, symbol: "SPY", amountEur: "440.76" }),
      ],
      [
        match({ brokerAccountId: ACCT.ff, symbol: "META", gainEur: "585.53" }),
        match({ brokerAccountId: ACCT.ff, symbol: "ENPH", gainEur: "-2228.45" }),
        match({ brokerAccountId: ACCT.ibkr, symbol: "BOND", gainEur: "-86.52" }),
        match({ brokerAccountId: ACCT.ff, symbol: "SCHD", gainEur: "55.10" }),
      ],
      {
        GM: STOCK, META: STOCK, ENPH: STOCK,
        BOND: { kind: "bond", subtype: null },
        SPY: AKTIENFONDS, SCHD: AKTIENFONDS,
      },
    ),
    domesticCertificates: [
      {
        issuer: "Revolut Bank UAB, Zweigniederlassung Deutschland",
        kapitalertraegeEur: "33.40",
        allowanceUsedEur: "0.00",
        kestEur: "8.35",
        solzEur: "0.46",
      },
    ],
  });
}

describe("persona: foreign-only-single (ELSTER-verified)", () => {
  it("emits the corrected form values", () => {
    const l = persona().kap.lines;
    expect(l.Z7.euros).toBe(33);
    expect(l.Z19.euros).toBe(-1398);
    expect(l.Z20.euros).toBe(586);
    expect(l.Z22.euros).toBe(87);
    expect(l.Z23.euros).toBe(2228);
    expect(l.Z37.cents).toBe("8.35");
    expect(l.Z38.cents).toBe("0.46");
  });

  it("reproduces ELSTER's 'Kapitalerträge' of 364", () => {
    // ELSTER derives it as Z7 + (Z19 - Z20 + Z22 + Z23).
    const l = persona().kap.lines;
    const derived = new Decimal(l.Z19.euros)
      .minus(l.Z20.euros).plus(l.Z22.euros).plus(l.Z23.euros)
      .plus(l.Z7.euros);
    expect(derived.toNumber()).toBe(364);
  });

  it("reconciles Folio's real output plus the external Vorabpauschale input to ELSTER's Zwischensumme of 1.302", () => {
    const d = persona();
    const l = d.kap.lines;

    // --- (a) Everything below this line is Folio's own computed output. ---

    // "Kapitalerträge" per ELSTER's derivation: Z7 + (Z19 - Z20 + Z22 + Z23).
    const kapitalertraege = new Decimal(l.Z19.euros)
      .minus(l.Z20.euros).plus(l.Z22.euros).plus(l.Z23.euros)
      .plus(l.Z7.euros);
    // "Gewinne aus Veräußerung von Aktien" — Folio's Zeile 20.
    const gewinneAusAktien = new Decimal(l.Z20.euros);
    // "Investmenterträge" — the Teilfreistellung-reduced (equity funds: 30 %
    // exempt, 70 % taxable) fund income Folio actually produces in KAP-INV,
    // truncated per line the way ELSTER does.
    const investmenterträgeFolio =
      Math.trunc(d.kapInv.section1.Z4_aktienfonds.euros * 0.7)
      + Math.trunc(d.kapInv.section2.Z14_aktienfonds.euros * 0.7);

    // --- (b) Below this line is NOT a Folio output. ---

    // Vorabpauschale (§18/§19 InvStG) is a deemed-distribution figure Folio
    // does not compute (that work is deferred to Plan 5 — see
    // BuildAnlageKapInput.accumulatingFunds, which today only warns). The
    // real taxpayer typed this €9 into ELSTER section 4 by hand for this
    // filing; it is reproduced here as a literal external input — never
    // pulled from any `draft` field — so the boundary between "what Folio
    // computed" and "what the user supplied ELSTER directly" stays explicit.
    const VORABPAUSCHALE_NOT_COMPUTED_BY_FOLIO = 9;
    const investmenterträgeVorabpauschale = Math.trunc(VORABPAUSCHALE_NOT_COMPUTED_BY_FOLIO * 0.7);

    const zwischensumme = kapitalertraege
      .plus(gewinneAusAktien)
      .plus(investmenterträgeFolio)
      .plus(investmenterträgeVorabpauschale);

    expect(zwischensumme.toNumber()).toBe(1302);
  });

  it("carries forward exactly the losses ELSTER could not offset", () => {
    expect(persona().kap.stockLossCarryforward.euros).toBe(1642);
  });

  it("emits no negative magnitude lines", () => {
    const l = persona().kap.lines;
    for (const [k, v] of Object.entries(l)) {
      if (k === "Z19") continue; // the only signed line
      expect(Number(v.cents)).toBeGreaterThanOrEqual(0);
    }
  });
});
