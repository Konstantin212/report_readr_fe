import type { NormalizedEvent } from "@/lib/domain/types";

export const FIXTURE: NormalizedEvent[] = [
  { id: "b1", broker: "INTERACTIVE_BROKERS", accountNumber: "U", type: "TRADE",
    date: "2024-01-10", currency: "EUR", symbol: "ASML",
    quantity: "10", amount: "-7000", amountEur: "-7000", fee: "1", feeEur: "1" },
  { id: "b2", broker: "INTERACTIVE_BROKERS", accountNumber: "U", type: "TRADE",
    date: "2024-06-01", currency: "EUR", symbol: "ASML",
    quantity: "5",  amount: "-4000", amountEur: "-4000", fee: "1", feeEur: "1" },
  { id: "s1", broker: "INTERACTIVE_BROKERS", accountNumber: "U", type: "TRADE",
    date: "2025-04-04", currency: "EUR", symbol: "ASML",
    quantity: "-8", amount: "7200", amountEur: "7200", fee: "1", feeEur: "1" },
];
