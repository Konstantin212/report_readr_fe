import { Document, Page, Text, View, StyleSheet, renderToStream } from "@react-pdf/renderer";
import React from "react";
import type { AnlageSoDraft } from "./anlage-so";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  h1: { fontSize: 18, marginBottom: 4, fontWeight: 700 },
  sub: { fontSize: 9, color: "#666", marginBottom: 14 },
  section: { marginTop: 16 },
  sectionH: { fontSize: 12, fontWeight: 700, marginBottom: 6 },
  kv: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  warn: { backgroundColor: "#FEF2E0", padding: 8, borderRadius: 3, marginTop: 8 },
  warnText: { fontSize: 10, color: "#925800" },
  table: { marginTop: 6, borderTop: 1, borderColor: "#E5E5E5" },
  tableRow: {
    flexDirection: "row",
    paddingTop: 4,
    paddingBottom: 4,
    borderBottom: 1,
    borderColor: "#EEE",
    fontSize: 9,
  },
  tableHead: {
    flexDirection: "row",
    paddingTop: 4,
    paddingBottom: 4,
    fontWeight: 700,
    fontSize: 9,
    backgroundColor: "#FAFAFA",
  },
  colDate: { width: 60 },
  colCoin: { width: 38 },
  colQty: { width: 90, textAlign: "right" },
  colPrice: { width: 70, textAlign: "right" },
  colEur: { width: 60, textAlign: "right" },
  colWallet: { width: 100, paddingLeft: 6 },
  footer: { marginTop: 18, fontSize: 8, color: "#888" },
});

export async function renderAnlageSoPdf(draft: AnlageSoDraft) {
  const totalLabel = formatEur(draft.total.stakingIncomeEur);
  const Doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Anlage SO — Steuerjahr {draft.taxYear}</Text>
        <Text style={styles.sub}>
          §22 Nr. 3 EStG — Einkünfte aus sonstigen Leistungen · Krypto-Staking · Personal evidence record
          {draft.taxpayerName ? `\nFiler: ${draft.taxpayerName}` : ""}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionH}>Summary</Text>
          <View style={styles.kv}>
            <Text>Total staking income received</Text>
            <Text>{totalLabel}</Text>
          </View>
          <View style={styles.kv}>
            <Text>Number of payouts</Text>
            <Text>{draft.total.eventCount}</Text>
          </View>
          <View style={styles.kv}>
            <Text>Freigrenze (§22 Nr. 3 EStG)</Text>
            <Text>€{draft.total.freigrenzeEur.toFixed(2)}</Text>
          </View>
          <View style={styles.kv}>
            <Text>Status</Text>
            <Text style={{ color: draft.total.freigrenzeReached ? "#A8231C" : "#1A7F2E" }}>
              {draft.total.freigrenzeReached ? "ABOVE — taxable in full" : "BELOW — no tax owed"}
            </Text>
          </View>
          <View style={styles.kv}>
            <Text>Taxable amount</Text>
            <Text>{formatEur(draft.total.taxableEur)}</Text>
          </View>
          {draft.total.freigrenzeReached && (
            <View style={styles.warn}>
              <Text style={styles.warnText}>
                Above €{draft.total.freigrenzeEur}: enter the full €{draft.total.stakingIncomeEur.toFixed(2)} on ELSTER →
                Anlage SO → Section "Andere Leistungen" (§22 Nr. 3). The €256 Freigrenze applies once across all such
                income (other 22 Nr. 3 sources combine).
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionH}>Per coin</Text>
          <View style={styles.tableHead}>
            <Text style={styles.colCoin}>Coin</Text>
            <Text style={styles.colQty}>Total qty</Text>
            <Text style={styles.colPrice}>Events</Text>
            <Text style={styles.colEur}>EUR value</Text>
          </View>
          {draft.perCoin.map((c) => (
            <View key={c.symbol} style={styles.tableRow}>
              <Text style={styles.colCoin}>{c.symbol}</Text>
              <Text style={styles.colQty}>{c.quantity.toFixed(6)}</Text>
              <Text style={styles.colPrice}>{c.eventCount}</Text>
              <Text style={styles.colEur}>{formatEur(c.totalEur)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Generated {new Date(draft.generatedAt).toISOString().slice(0, 16)} UTC. Personal record — not a certified tax
          filing. Verify with your Steuerberater before submission. Out of scope: §23 EStG private sale gains (held
          {" <"}1 year).
        </Text>
      </Page>

      {/* Detail page(s): one row per payout */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Anlage SO — Detail (every payout)</Text>
        <Text style={styles.sub}>
          One row per staking payout, in date order. EUR value computed at the FX rate effective on the receipt
          date (source: ECB daily reference rates).
        </Text>
        <View style={styles.tableHead}>
          <Text style={styles.colDate}>Date</Text>
          <Text style={styles.colCoin}>Coin</Text>
          <Text style={styles.colQty}>Quantity</Text>
          <Text style={styles.colPrice}>EUR / unit</Text>
          <Text style={styles.colEur}>EUR value</Text>
          <Text style={styles.colWallet}>Wallet</Text>
        </View>
        {draft.events.map((e, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.colDate}>{e.date}</Text>
            <Text style={styles.colCoin}>{e.symbol}</Text>
            <Text style={styles.colQty}>{e.quantity.toFixed(8)}</Text>
            <Text style={styles.colPrice}>
              {e.quantity > 0 ? (e.eurValue / e.quantity).toFixed(4) : "—"}
            </Text>
            <Text style={styles.colEur}>{e.eurValue.toFixed(4)}</Text>
            <Text style={styles.colWallet}>{e.walletName ?? ""}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
  return renderToStream(Doc);
}

function formatEur(v: number): string {
  return `€${v.toFixed(2)}`;
}
