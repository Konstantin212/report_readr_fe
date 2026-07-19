/**
 * Anlage KAP Zeilen 7 / 37 / 38 — capital income WITH German withholding.
 *
 * Every broker the app supported until now is foreign: no German tax is
 * withheld, so all income routes to Zeile 19 and the credit lines stay
 * empty. Revolut broke that assumption. Revolut Bank UAB operates a German
 * branch (Zweigniederlassung Deutschland, BaFin-supervised), so it withholds
 * German Kapitalertragsteuer at source and issues a Steuerbescheinigung
 * naming the ELSTER lines directly.
 *
 * The user's real 2025 certificate ("Bescheinigung für alle Privatkonten"):
 *
 *   Höhe der Kapitalerträge              Zeile 7  Anlage KAP   33,40 €
 *   in Anspruch genommener Pauschbetrag  Zeile 16/17            0,00 €
 *   Kapitalertragsteuer                  Zeile 37 Anlage KAP    8,35 €
 *   Solidaritätszuschlag                 Zeile 38 Anlage KAP    0,46 €
 *   Kirchensteuer                        Zeile 39 Anlage KAP    0,00 €
 *
 * These figures are DECLARED, not derived. A Steuerbescheinigung is the
 * legal source for those lines (§45a EStG) and the withheld tax cannot be
 * recomputed from a transaction export — the statements show net interest
 * and never mention the German tax. So the builder takes certificates as
 * input and sums them, exactly as a filer copies the certificate into
 * ELSTER.
 */
import { describe, it, expect } from "vitest";
import { buildKapAndKapInv } from "@/lib/tax/german-tax";
import type { KapDomesticCertificate } from "@/lib/tax/german-tax";
import { buildInputs } from "./kap-fixtures";

const REVOLUT_2025 = {
  issuer: "Revolut Bank UAB, Zweigniederlassung Deutschland",
  kapitalertraegeEur: "33.40",
  allowanceUsedEur: "0.00",
  kestEur: "8.35",
  solzEur: "0.46",
  kirchensteuerEur: "0.00",
};

const withCerts = (certs: KapDomesticCertificate[]) =>
  buildKapAndKapInv({ ...buildInputs([], []), domesticCertificates: certs });

describe("Anlage KAP — domestic withholding certificates", () => {
  it("is inert when no certificate is supplied (every other broker)", () => {
    const draft = buildKapAndKapInv(buildInputs([], []));
    expect(draft.kap.lines.Z7.euros).toBe(0);
    expect(draft.kap.lines.Z37.euros).toBe(0);
    expect(draft.kap.lines.Z38.euros).toBe(0);
  });

  it("routes certificate income to Zeile 7, not Zeile 19", () => {
    const draft = withCerts([REVOLUT_2025]);
    expect(draft.kap.lines.Z7.cents).toBe("33.40");
    // Zeile 19 is FOREIGN income with no German withholding. Adding the
    // certificate there would misdeclare it and lose the Z37/Z38 credit.
    expect(draft.kap.lines.Z19.cents).toBe("0.00");
  });

  it("credits the withheld German tax to Zeilen 37 and 38", () => {
    const draft = withCerts([REVOLUT_2025]);
    expect(draft.kap.lines.Z37.cents).toBe("8.35");
    expect(draft.kap.lines.Z38.cents).toBe("0.46");
  });

  it("never routes German KESt to the FOREIGN withholding lines", () => {
    // The filing handoff doc mislabelled this German KESt as "foreign tax
    // credited ≈ €9.00". It is not creditable foreign tax and must never
    // reach Z51/Z52.
    const draft = withCerts([REVOLUT_2025]);
    expect(draft.kap.lines.Z51.euros).toBe(0);
    expect(draft.kap.lines.Z52.euros).toBe(0);
  });

  it("sums several certificates (one per German institution)", () => {
    const draft = withCerts([
      REVOLUT_2025,
      { issuer: "Some Sparkasse", kapitalertraegeEur: "100.00", kestEur: "25.00", solzEur: "1.37" },
    ]);
    expect(draft.kap.lines.Z7.cents).toBe("133.40");
    expect(draft.kap.lines.Z37.cents).toBe("33.35");
    expect(draft.kap.lines.Z38.cents).toBe("1.83");
  });

  it("warns when tax was withheld while the Sparer-Pauschbetrag went unused", () => {
    // A Freistellungsauftrag would have avoided the withholding entirely.
    // Real money: the 2025 certificate shows €0.00 used against €1,000.
    const draft = withCerts([REVOLUT_2025]);
    expect(draft.warnings.join(" ")).toMatch(/Freistellungsauftrag/i);
  });

  it("emits evidence naming the issuer so the figure is auditable", () => {
    const draft = withCerts([REVOLUT_2025]);
    const item = draft.evidence.find((e) => e.formTarget === "KAP_Z7");
    expect(item).toBeDefined();
    expect(item?.broker).toContain("Revolut");
    expect(item?.grossEur).toBe("33.40");
  });
});
