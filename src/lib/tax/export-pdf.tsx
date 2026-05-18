import { Document, Page, Text, View, StyleSheet, renderToStream } from "@react-pdf/renderer";
import React from "react";
import type { GermanTaxDraft } from "./german-tax";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  h: { fontSize: 18, marginBottom: 12, fontWeight: 700 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  sub: { fontSize: 9, color: "#666", marginTop: 16 },
});

const LINE_LABELS: Record<keyof GermanTaxDraft["lines"], string> = {
  Z19: "Z19 — Capital income (gross)",
  Z20: "Z20 — of which foreign",
  Z21: "Z21 — (reserved)",
  Z22: "Z22 — of which from share sales (net)",
  Z41: "Z41 — Already-paid Abgeltungsteuer",
  Z51: "Z51 — Foreign WHT paid",
  Z52: "Z52 — Foreign WHT eligible for offset",
};

export async function renderKapPdf(draft: GermanTaxDraft) {
  const Doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h}>Anlage KAP — Steuerjahr {draft.taxYear}</Text>
        {(Object.keys(LINE_LABELS) as Array<keyof typeof LINE_LABELS>).map(k => (
          <View key={k} style={styles.row}>
            <Text>{LINE_LABELS[k]}</Text>
            <Text>€{draft.lines[k]}</Text>
          </View>
        ))}
        <Text style={styles.sub}>
          This document is a personal record of values to copy into your ELSTER Anlage KAP form.
          It is not a certified tax filing. Confirm with your Steuerberater before submission.
        </Text>
      </Page>
    </Document>
  );
  return renderToStream(Doc);
}
