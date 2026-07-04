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
  const s22 = draft.total.section22;
  const s23 = draft.total.section23;
  const Doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Anlage SO — Steuerjahr {draft.taxYear}</Text>
        <Text style={styles.sub}>
          §22 Nr. 3 EStG (sonstige Leistungen · Krypto-Staking) + §23 EStG (private Veräußerungsgeschäfte) · Personal
          evidence record{draft.taxpayerName ? `\nFiler: ${draft.taxpayerName}` : ""}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionH}>§22 Nr. 3 — Staking income</Text>
          <View style={styles.kv}>
            <Text>Total staking income received</Text>
            <Text>{formatEur(s22.stakingIncomeEur)}</Text>
          </View>
          <View style={styles.kv}>
            <Text>Number of payouts</Text>
            <Text>{s22.eventCount}</Text>
          </View>
          <View style={styles.kv}>
            <Text>Freigrenze (§22 Nr. 3 EStG)</Text>
            <Text>€{s22.freigrenzeEur.toFixed(2)}</Text>
          </View>
          <View style={styles.kv}>
            <Text>Status</Text>
            <Text style={{ color: s22.freigrenzeReached ? "#A8231C" : "#1A7F2E" }}>
              {s22.freigrenzeReached ? "ABOVE — taxable in full" : "BELOW — no tax owed"}
            </Text>
          </View>
          <View style={styles.kv}>
            <Text>Taxable (§22 Nr. 3)</Text>
            <Text>{formatEur(s22.taxableEur)}</Text>
          </View>
          {s22.freigrenzeReached && (
            <View style={styles.warn}>
              <Text style={styles.warnText}>
                Above €{s22.freigrenzeEur}: enter the full €{s22.stakingIncomeEur.toFixed(2)} on ELSTER → Anlage SO →
                &quot;Leistungen&quot; (§22 Nr. 3). This €256 Freigrenze is separate from the §23 one below and applies
                once across all your sonstige Leistungen.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionH}>§22 — Staking by coin</Text>
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

        {draft.section23Matches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionH}>§23 — Private sale gains</Text>
            <View style={styles.kv}>
              <Text>Net short-term result (held ≤ 365 days)</Text>
              <Text>{formatEur(s23.shortTermNetGainEur)}</Text>
            </View>
            <View style={styles.kv}>
              <Text>Long-term tax-free gains (held &gt; 365 days)</Text>
              <Text style={{ color: "#888" }}>{formatEur(s23.longTermTaxFreeEur)}</Text>
            </View>
            <View style={styles.kv}>
              <Text>Number of realized matches</Text>
              <Text>{s23.matchCount}</Text>
            </View>
            <View style={styles.kv}>
              <Text>Freigrenze (§23 EStG, {draft.taxYear})</Text>
              <Text>€{s23.freigrenzeEur.toFixed(2)}</Text>
            </View>
            <View style={styles.kv}>
              <Text>Taxable (§23)</Text>
              <Text>{formatEur(s23.taxableEur)}</Text>
            </View>
            {s23.lossCarryforwardEur > 0 && (
              <View style={styles.warn}>
                <Text style={styles.warnText}>
                  Net §23 loss of €{s23.lossCarryforwardEur.toFixed(2)}: no tax owed, but declare it so the Finanzamt
                  records a §23 loss carryforward (Verlustfeststellung). §23 losses only offset §23 gains — never §22
                  income or other income.
                </Text>
              </View>
            )}
            {s23.freigrenzeReached && (
              <View style={styles.warn}>
                <Text style={styles.warnText}>
                  Above €{s23.freigrenzeEur}: the full €{s23.shortTermNetGainEur.toFixed(2)} is taxable on ELSTER →
                  Anlage SO → &quot;Private Veräußerungsgeschäfte&quot;. This threshold is independent of the §22
                  Freigrenze above.
                </Text>
              </View>
            )}
            <Text style={styles.sub}>
              §22 and §23 are separate income types with separate Freigrenzen; they are not combined. Long-term gains
              are tax-free (1-year holding rule) and listed for completeness only.
            </Text>
          </View>
        )}

        <Text style={styles.footer}>
          Generated {new Date(draft.generatedAt).toISOString().slice(0, 16)} UTC. Personal record — not a certified tax
          filing. Verify with your Steuerberater before submission.
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

      {draft.section23Matches.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>§23 — Realized matches (FIFO)</Text>
          <Text style={styles.sub}>
            Each row is a closed lot. Long-term matches (over 365 days) are tax-free; short-term matches net together
            and are taxable under §23 only if the net exceeds the €{s23.freigrenzeEur} Freigrenze.
          </Text>
          <View style={styles.tableHead}>
            <Text style={styles.colDate}>Opened</Text>
            <Text style={styles.colDate}>Closed</Text>
            <Text style={styles.colCoin}>Coin</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colPrice}>Days</Text>
            <Text style={styles.colEur}>Cost</Text>
            <Text style={styles.colEur}>Proceeds</Text>
            <Text style={styles.colEur}>Gain</Text>
          </View>
          {draft.section23Matches.map((m, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colDate}>{m.openedAt}</Text>
              <Text style={styles.colDate}>{m.closedAt}</Text>
              <Text style={styles.colCoin}>{m.symbol}</Text>
              <Text style={styles.colQty}>{m.qty.toFixed(6)}</Text>
              <Text style={styles.colPrice}>{m.holdingDays}{m.isLongTerm ? " ✓" : ""}</Text>
              <Text style={styles.colEur}>{m.costEur.toFixed(2)}</Text>
              <Text style={styles.colEur}>{m.proceedsEur.toFixed(2)}</Text>
              <Text style={styles.colEur}>{m.gainEur.toFixed(2)}</Text>
            </View>
          ))}
        </Page>
      )}
    </Document>
  );
  return renderToStream(Doc);
}

function formatEur(v: number): string {
  return `€${v.toFixed(2)}`;
}
