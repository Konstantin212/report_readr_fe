import { Document, Page, Text, View, StyleSheet, renderToStream } from "@react-pdf/renderer";
import React from "react";
import type { GermanTaxDraft, ZeileValue } from "./german-tax";
import { KAP_FIELDS, labelFor, fieldFor } from "./elster-fields";

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

function ZeileRow({
  label, value, precision,
}: { label: string; value: ZeileValue; precision?: "whole_euro" | "euro_cent" }) {
  const primary = precision === "euro_cent" ? value.cents : String(value.euros);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueBox}>
        <Text style={styles.valueLarge}>{primary}</Text>
        {value.cents !== "0.00" && precision !== "euro_cent" && (
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
        Income lines (Zeilen 7, 17, 19–23) take WHOLE EUROS — enter the large
        number with no decimal separator. The tax-credit lines in section 8
        (Zeilen 37, 38, 41) take EUROS AND CENTS — enter them exactly as shown,
        including the decimals. Entering 20 instead of 20,30 discards
        creditable tax.
      </Text>

      <Text style={styles.h2}>Checkbox</Text>
      <CheckboxRow
        label="Z4 — Antrag auf Günstigerprüfung"
        set={draft.kap.Z4_guenstigerpruefung}
      />

      <Text style={styles.h2}>Werte</Text>
      {KAP_FIELDS.map((f) => {
        const key = f.key.replace("KAP_", "") as keyof typeof draft.kap.lines;
        return (
          <ZeileRow
            key={f.key}
            label={labelFor(f.key)}
            value={draft.kap.lines[key]}
            precision={f.precision}
          />
        );
      })}

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
        ? "ADD Anlage KAP-INV to the ELSTER form list (you have ETF / fund income — no KAP checkbox exists for this)"
        : "Anlage KAP-INV NOT required (no ETF / fund income)",
    },
    { mark: "no", text: "Anlage KAP-BET NOT required for this filing" },
    {
      mark: draft.kap.Z4_guenstigerpruefung ? "yes" : "no",
      text: draft.kap.Z4_guenstigerpruefung
        ? "KAP Zeile 4 (Antrag auf Günstigerprüfung): TICK — marginal rate likely below 25 %; ALL capital income must then be declared."
        : "KAP Zeile 4 (Antrag auf Günstigerprüfung): leave UNCHECKED — only worthwhile below a 25 % marginal income-tax rate.",
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
  if (draft.kap.stockLossCarryforward.euros > 0) {
    items.push({
      mark: "warn",
      text:
        `TICK "Erklärung zur Feststellung des verbleibenden Verlustvortrags" on the Hauptvordruck — `
        + `~€${draft.kap.stockLossCarryforward.euros} of stock losses exceed this year's stock gains (§20 Abs.6 S.4).`,
    });
  }
  if (Number(draft.kap.lines.Z41.cents) > 0) {
    items.push({
      mark: "yes",
      text: `KAP Zeile 41 = ${draft.kap.lines.Z41.cents} (${fieldFor("KAP_Z41").caption}, gedeckelt durch DBA)`,
    });
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
          Applies to the income lines (Zeilen 7, 17, 19–23) — re-enter using only the whole-euro
          number, no comma or period (Zeile 19 may be negative — keep the minus sign). Section 8
          lines (Zeilen 37, 38, 41) take EUROS AND CENTS — enter them exactly as shown, decimals included.
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
