/**
 * One-off backfill after the 2026-07 tax-classification fixes.
 *
 *  1. Legacy IBKR DIVIDEND/INTEREST/WITHHOLDING_TAX rows were stored
 *     without symbol/ISIN (the parser only kept the description, e.g.
 *     "SPYW(IE00B5M1WJ87) Cash Dividend …"). Extract both back onto the
 *     rows for ALL users.
 *  2. instruments.kind backfill: FF's activity JSON declares per-trade
 *     instrument kinds (instr_kind); apply the known ones + the IBKR
 *     Citigroup bond (US172967MZ11, "C Float 06/09/27").
 *  3. Re-run FIFO replay for every non-crypto account so the new
 *     split-aware replay rebuilds lots/matches (fixes the SCHD 3:1
 *     phantom loss).
 *
 * Run: export DATABASE_URL=…; npx tsx scripts/backfill-tax-classification.ts
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { brokerAccounts, instruments, transactions } from "@/lib/db/schema";
import { runReplayForAccount } from "@/lib/imports/ingest";

const SYM_ISIN_RE = /^\s*([A-Z0-9.]{1,12})\(([A-Z]{2}[A-Z0-9]{9}[0-9])\)/;

// Broker-declared kinds recovered from the user's FF activity JSON
// (instr_kind per trade row) + the IBKR bond identified by its FII name.
const KIND_BY_ISIN: Record<string, string> = {
  US8085247976: "etf", // SCHD — FF instr_kind "фонд/ETF"
  US172967MZ11: "bond", // Citigroup "C Float 06/09/27" — IBKR bond under symbol C
};

async function main() {
  const db = getDb();

  // --- 1. IBKR symbol/ISIN backfill from descriptions -------------------
  const rows = await db
    .select({ id: transactions.id, description: transactions.description, eventType: transactions.eventType })
    .from(transactions)
    .where(
      and(
        eq(transactions.broker, "INTERACTIVE_BROKERS"),
        isNull(transactions.symbol),
        inArray(transactions.eventType, ["DIVIDEND", "INTEREST", "WITHHOLDING_TAX"]),
      ),
    );
  let filled = 0;
  for (const r of rows) {
    const m = SYM_ISIN_RE.exec(r.description ?? "");
    if (!m) continue;
    await db.update(transactions).set({ symbol: m[1], isin: m[2] }).where(eq(transactions.id, r.id));
    filled++;
  }
  console.log(`1) IBKR rows scanned: ${rows.length}, symbol/isin backfilled: ${filled}`);

  // --- 2. instruments.kind backfill --------------------------------------
  for (const [isin, kind] of Object.entries(KIND_BY_ISIN)) {
    const res = await db.update(instruments).set({ kind }).where(eq(instruments.isin, isin));
    console.log(`2) instruments.kind ${isin} → ${kind} (${(res as { rowCount?: number }).rowCount ?? "?"} rows)`);
  }

  // --- 3. Re-run replay for all non-crypto accounts ----------------------
  const accts = await db.select().from(brokerAccounts);
  for (const a of accts) {
    if (a.broker === "COINBASE") continue;
    await runReplayForAccount(a.ownerUserId, a.id);
    console.log(`3) replay re-run: ${a.broker} ${a.accountNumber}`);
  }

  console.log("done");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
