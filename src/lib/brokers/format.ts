export function decodeBytes(bytes: Uint8Array | ArrayBuffer): string {
  return new TextDecoder("utf-8").decode(bytes);
}

export function cleanString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export function cleanNumber(value: unknown): string | undefined {
  const text = cleanString(value);
  if (!text) {
    return undefined;
  }

  const normalized = text.replace(/\s/g, "").replace(/,/g, "");
  const numeric = Number(normalized);

  if (!Number.isFinite(numeric)) {
    return text;
  }

  if (Object.is(numeric, -0)) {
    return "0";
  }

  return numeric.toString();
}

/**
 * Parse a broker-supplied price/amount string into a positive finite
 * number, or `null` when the value is missing, malformed, zero, or
 * negative. Used by snapshot-quote parsers — both brokers want exactly
 * the same "skip bad rows" semantics for the close-price column.
 */
export function parsePositiveAmount(value: string | undefined): number | null {
  if (!value) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

export function absoluteNumber(value: unknown): string | undefined {
  const text = cleanNumber(value);
  if (!text) {
    return undefined;
  }

  const numeric = Number(text);
  return Number.isFinite(numeric) ? Math.abs(numeric).toString() : text;
}

export function addNumbers(...values: Array<string | undefined>): string | undefined {
  const numericValues = values.map((value) => Number(value ?? 0));
  if (numericValues.some((value) => !Number.isFinite(value))) {
    return undefined;
  }

  return numericValues.reduce((total, value) => total + value, 0).toString();
}

export function subtractNumbers(left: string | undefined, right: string | undefined): string | undefined {
  return addNumbers(left, right ? (-Number(right)).toString() : undefined);
}

export function negateNumber(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? (-numeric).toString() : undefined;
}

export function signedQuantity(quantity: unknown, operation: unknown): string | undefined {
  const text = cleanNumber(quantity);
  if (!text) {
    return undefined;
  }

  const numeric = Number(text);
  if (!Number.isFinite(numeric)) {
    return text;
  }

  const operationText = String(operation ?? "").toLowerCase();
  const shouldBeNegative =
    operationText.includes("sell") ||
    operationText.includes("sale") ||
    operationText.includes("sold") ||
    operationText.includes("withdraw");

  return (shouldBeNegative ? -Math.abs(numeric) : Math.abs(numeric)).toString();
}

export function dateOnly(value: unknown): string {
  // Returns YYYY-MM-DD when the input contains a recognizable ISO date,
  // otherwise the empty string. Callers should filter "" rows out before
  // emitting events — we deliberately don't fall back to slicing the raw
  // text, because broker exports often use sentinel values like "Grouped"
  // that would otherwise pass downstream validators and explode at ingest.
  const text = cleanString(value);
  if (!text) {
    return "";
  }

  const normalized = text.replace(";", "T");
  const isoDate = normalized.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  return isoDate ?? "";
}

export function isInTaxYear(date: string | undefined, taxYear: number): boolean {
  return Boolean(date?.startsWith(`${taxYear}-`));
}

export function compactEvent<T extends Record<string, unknown>>(event: T): T {
  return Object.fromEntries(
    Object.entries(event).filter(([, value]) => value !== undefined && value !== ""),
  ) as T;
}
