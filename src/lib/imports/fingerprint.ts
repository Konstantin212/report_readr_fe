import { createHash } from "node:crypto";

import type { NormalizedEvent } from "@/lib/domain/types";

const identityFields = [
  "broker",
  "accountNumber",
  "date",
  "type",
  "source",
  "symbol",
  "isin",
  "currency",
  "quantity",
  "price",
  "amount",
  "cashAmount",
  "proceeds",
  "fee",
  "realizedPnl",
  "withholdingTax",
  "description",
] as const;

export function computeEventFingerprint(event: NormalizedEvent): string {
  const payload = Object.fromEntries(identityFields.map((field) => [field, normalizeValue(event[field])]));
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function normalizeValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}
