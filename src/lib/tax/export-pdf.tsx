import { Document, Page, Text, View, StyleSheet, renderToStream } from "@react-pdf/renderer";
import React from "react";
import type { GermanTaxDraft, ZeileValue } from "./german-tax";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  h1: { fontSize: 18, marginBottom: 4, fontWeight: 700 },
  h2: { fontSize: 13, marginTop: 16, marginBottom: 8, fontWeight: 700, color: "#222" },
  subtle: { fontSize: 9, color: "#666", marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5, paddingVertical: 1 },
  label: { flex: 1, paddingRight: 12 },
  valueBox: { minWidth: 80, alignItems: "flex-end" },
  valueLarge: { fontSize: 13, fontWeight: 700, color: "#000" },
  valueSubtle: { fontSize: 8, color: "#888", marginTop: 1 },
  checkbox: { fontSize: 13, fontWeight: 700, color: "#0a7d39" },
  warningBanner: {
    backgroundColor: "#fff5d0",
    borderLeft: "3px solid #c08600",
    padding: 8,
    marginVertical: 8,
    fontSize: 9,
    color: "#5a3d00",
  },
  checkItem: { flexDirection: "row", marginBottom: 4 },
  checkMark: { width: 24, fontSize: 11 },
  checkLabel: { flex: 1, fontSize: 10 },
  footer: { fontSize: 9, color: "#666", marginTop: 20 },
});

const KAP_LABELS = {
  Z17: "Z17 — Sparer-Pauschbetrag gegen nicht-KAP Erträge",
  Z19: "Z19 — Ausländische Kapitalerträge (gesamt)",
  Z20: "Z20 — darin: Gewinne aus Aktienveräußerungen",
  Z22: "Z22 — darin: Verluste ohne Aktienveräußerungen",
  Z23: "Z23 — darin: Verluste aus Aktienveräußerungen",
  Z41: "Z41 — Bereits gezahlte Abgeltungsteuer",
  Z51: "Z51 — Ausländische Quellensteuer (brutto)",
  Z52: "Z52 — Anrechenbare ausl. Quellensteuer (gekappt)",
};
const KAP_INV_S1_LABELS = {
  Z4_aktienfonds: "Z4 — Aktienfonds",
  Z5_mischfonds: "Z5 — Mischfonds",
  Z6_immo_inland: "Z6 — Inländische Immobilienfonds",
  Z7_immo_ausland: "Z7 — Auslands-Immobilienfonds",
  Z8_sonstige: "Z8 — Sonstige Investmentfonds",
};
const KAP_INV_S2_LABELS = {
  Z14_aktienfonds: "Z14 — Aktienfonds",
  Z17_mischfonds: "Z17 — Mischfonds",
  Z20_immo_inland: "Z20 — Inländische Immobilienfonds",
  Z23_immo_ausland: "Z23 — Auslands-Immobilienfonds",
  Z26_sonstige: "Z26 — Sonstige Investmentfonds",
};

function ZeileRow({ label, value }: { label: string; value: ZeileValue }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueBox}>
        <Text style={styles.valueLarge}>{value.euros}</Text>
        {value.cents !== "0.00" && (
          <Text style={styles.valueSubtle}>actual €{value.cents}</Text>
        )}
      </View>
    </View>
  );
}

function CheckboxRow({ label, set }: { label: string; set: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueBox}>
        <Text style={styles.checkbox}>{set ? "☑  SET CHECKBOX" : "☐  leave blank"}</Text>
      </View>
    </View>
  );
}

function KapPage({ draft }: { draft: GermanTaxDraft }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>Anlage KAP — Steuerjahr {draft.taxYear}</Text>
      <Text style={styles.subtle}>
        Whole-euro values for ELSTER. Enter the LARGE number exactly — no decimal separator.
        ELSTER rejects &quot;127,30&quot; with the error: &quot;Volle Geldbeträge müssen als Ziffernfolge
        ohne Dezimaltrenner eingetragen werden.&quot;
      </Text>

      <Text style={styles.h2}>Checkbox</Text>
      <CheckboxRow
        label="Z4 — Anlage KAP-INV ist beigefügt"
        set={draft.kap.Z4_kapInvAttached}
      />

      <Text style={styles.h2}>Werte</Text>
      {(Object.keys(KAP_LABELS) as Array<keyof typeof KAP_LABELS>).map((k) => (
        <ZeileRow key={k} label={KAP_LABELS[k]} value={draft.kap.lines[k]} />
      ))}

      {draft.warnings.length > 0 && (
        <View style={styles.warningBanner}>
          <Text style={{ fontWeight: 700, marginBottom: 2 }}>Warnings:</Text>
          {draft.warnings.map((w, i) => (
            <Text key={i}>• {w}</Text>
          ))}
        </View>
      )}

      <Text style={styles.footer}>
        Personal record only. Not a certified tax filing. Verify with your Steuerberater.
      </Text>
    </Page>
  );
}

function KapInvPage({ draft }: { draft: GermanTaxDraft }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>Anlage KAP-INV — Steuerjahr {draft.taxYear}</Text>
      <Text style={styles.subtle}>
        Investmenterträge (ETFs / Investmentfonds). ELSTER applies the Teilfreistellung
        haircut automatically — enter the gross figure in whole euros.
      </Text>

      <Text style={styles.h2}>Section 1 — Laufende Erträge (Distributions)</Text>
      {(Object.keys(KAP_INV_S1_LABELS) as Array<keyof typeof KAP_INV_S1_LABELS>).map((k) => (
        <ZeileRow key={k} label={KAP_INV_S1_LABELS[k]} value={draft.kapInv.section1[k]} />
      ))}

      <Text style={styles.h2}>Section 2 — Veräußerungsgewinne (Sale Gains)</Text>
      {(Object.keys(KAP_INV_S2_LABELS) as Array<keyof typeof KAP_INV_S2_LABELS>).map((k) => (
        <ZeileRow key={k} label={KAP_INV_S2_LABELS[k]} value={draft.kapInv.section2[k]} />
      ))}
    </Page>
  );
}

function ChecklistPage({ draft }: { draft: GermanTaxDraft }) {
  const items: Array<{ mark: "yes" | "no" | "warn"; text: string }> = [
    { mark: "yes", text: "Anlage KAP attached" },
    {
      mark: draft.kapInv.present ? "yes" : "no",
      text: draft.kapInv.present
        ? "Anlage KAP-INV attached (you have ETF / fund income)"
        : "Anlage KAP-INV NOT required (no ETF / fund income)",
    },
    { mark: "no", text: "Anlage KAP-BET NOT required for this filing" },
    {
      mark: draft.kap.Z4_kapInvAttached ? "yes" : "no",
      text: `KAP Zeile 4 checkbox ${draft.kap.Z4_kapInvAttached ? "SET" : "NOT set"} (KAP-INV beigefügt)`,
    },
    {
      mark: "yes",
      text: "KAP Zeile 17 = 0 (let ELSTER auto-allocate the Sparer-Pauschbetrag)",
    },
    {
      // Z19 non-zero is normal for stock dividends or interest — informational.
      mark: "yes",
      text:
        draft.kap.lines.Z19.euros === 0
          ? "KAP Zeile 19 = 0 (no non-fund foreign capital income)"
          : `KAP Zeile 19 = ${draft.kap.lines.Z19.euros} (ausländische Kapitalerträge, gesamt)`,
    },
  ];

  // §20 Abs.6 stock-sale gain/loss breakout — separate non-negative lines.
  if (draft.kap.lines.Z20.euros > 0) {
    items.push({ mark: "yes", text: `KAP Zeile 20 = ${draft.kap.lines.Z20.euros} (Gewinne aus Aktienveräußerungen)` });
  }
  if (draft.kap.lines.Z23.euros > 0) {
    items.push({ mark: "warn", text: `KAP Zeile 23 = ${draft.kap.lines.Z23.euros} (Verluste aus Aktienveräußerungen — only offset stock gains)` });
  }
  if (draft.kap.lines.Z22.euros > 0) {
    items.push({ mark: "warn", text: `KAP Zeile 22 = ${draft.kap.lines.Z22.euros} (Verluste ohne Aktienveräußerungen)` });
  }
  if (draft.kap.lines.Z51.euros > 0) {
    items.push({ mark: "yes", text: `KAP Zeile 51 = ${draft.kap.lines.Z51.euros} (ausländische Quellensteuer, brutto)` });
  }

  if (draft.kapInv.present) {
    if (draft.kapInv.section1.Z4_aktienfonds.euros > 0) {
      items.push({
        mark: "yes",
        text: `KAP-INV Section 1 Zeile 4 = ${draft.kapInv.section1.Z4_aktienfonds.euros} (Aktienfonds — equity-ETF distributions)`,
      });
    }
    if (draft.kapInv.section1.Z8_sonstige.euros > 0) {
      items.push({
        mark: "warn",
        text: `KAP-INV Section 1 Zeile 8 = ${draft.kapInv.section1.Z8_sonstige.euros} (Sonstige — verify the fund classification with your Steuerberater)`,
      });
    }
  }

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>Pre-submission checklist — Steuerjahr {draft.taxYear}</Text>
      <Text style={styles.subtle}>Tick each before clicking Versenden in ELSTER.</Text>

      {items.map((it, i) => (
        <View key={i} style={styles.checkItem}>
          <Text style={styles.checkMark}>
            {it.mark === "yes" ? "✓" : it.mark === "no" ? "✗" : "!"}
          </Text>
          <Text style={styles.checkLabel}>{it.text}</Text>
        </View>
      ))}

      <View style={styles.warningBanner}>
        <Text style={{ fontWeight: 700, marginBottom: 2 }}>If ELSTER rejects a value:</Text>
        <Text>
          • &quot;Volle Geldbeträge müssen als Ziffernfolge ohne Dezimaltrenner eingetragen werden.&quot;
          You typed cents — re-enter using only the LARGE whole-euro number on this PDF (no comma, no period, no minus).
        </Text>
      </View>

      <Text style={styles.footer}>
        Personal record only. Not a certified tax filing. Verify with your Steuerberater.
      </Text>
    </Page>
  );
}

export async function renderKapPdf(draft: GermanTaxDraft) {
  const Doc = (
    <Document>
      <KapPage draft={draft} />
      {draft.kapInv.present && <KapInvPage draft={draft} />}
      <ChecklistPage draft={draft} />
    </Document>
  );
  return renderToStream(Doc);
}
