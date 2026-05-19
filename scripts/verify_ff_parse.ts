import { parseFreedomFinanceStatement } from "../src/lib/brokers/freedom";
import { readFileSync } from "node:fs";

const path = "C:/Users/Kostan/Downloads/201743_2021-04-30 23_59_59_2026-05-16 23_59_59_all.json";
const bytes = readFileSync(path);
const r = parseFreedomFinanceStatement("x.json", bytes, 2024);

console.log("total events:", r.events.length);

const byCcy: Record<string, number> = {};
for (const e of r.events) {
  if (!e.cashAmount) continue;
  const c = (e.currency ?? "EUR") as string;
  byCcy[c] = (byCcy[c] ?? 0) + Number(e.cashAmount);
}
console.log("Net cash by currency:");
for (const [c, v] of Object.entries(byCcy).sort()) console.log("  " + c + ": " + v.toFixed(2));

const byType: Record<string, number> = {};
for (const e of r.events) {
  byType[e.type] = (byType[e.type] ?? 0) + 1;
}
console.log("Event-type counts:", byType);

const positions = new Map<string, number>();
for (const e of r.events) {
  if (e.type === "TRADE" && e.symbol && e.quantity) {
    positions.set(e.symbol, (positions.get(e.symbol) ?? 0) + Number(e.quantity));
  }
}
console.log("Net positions (after all trades, non-zero only):");
for (const [s, q] of [...positions.entries()].sort()) {
  if (Math.abs(q) > 0.0001) console.log("  " + s + ": " + q);
}
