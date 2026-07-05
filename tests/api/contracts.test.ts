/**
 * Shared API contract tests. The compile-time half of the guarantee is
 * enforced by tsc itself (schemas are declared `z.ZodType<LoaderType>`, so a
 * BE type change that drifts from the schema fails the build). These tests
 * cover the runtime half: a correctly-shaped payload passes, drifted
 * payloads produce issues, and the client helper warns without throwing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  positionRowSchema,
  positionsDataSchema,
  selectedPositionSchema,
  taxResponseSchema,
} from "@/lib/api/contracts";
import { fetchApi } from "@/lib/api/client";
import type { PositionRow, PositionsData, SelectedPosition } from "@/lib/data/positions";

const view = {
  avgCostEur: 10,
  costEur: 100,
  plEur: 5,
  plPct: 5,
  avgCostNative: null,
  costNative: null,
  plNative: null,
};

// Typed as the loader type on purpose — tsc verifies the fixture, the
// schema verifies the fixture, so fixture drift is caught from both sides.
const row: PositionRow = {
  symbol: "SPY",
  broker: "FF",
  currency: "USD",
  sector: "ETF",
  kind: "etf",
  qty: 10,
  pricePerUnitEur: 50,
  marketEur: 500,
  asOf: "2026-07-04",
  quoteSource: "FMP",
  quoteUpdatedAt: "2026-07-04T12:00:00.000Z",
  nativeCurrency: "USD",
  pricePerUnitNative: 55,
  marketNative: 550,
  views: { broker: view, net: view },
  dividendsEur: 12,
  dividendsNative: 13,
  feesEur: 1,
  distribution: { policy: "DISTRIBUTING", frequency: "Quarterly" },
  metaSource: null,
};

const selected: SelectedPosition = {
  ...row,
  sparkline: [1, 2, 3],
  sparkPctChange: 4.2,
  lots: [{ openedAt: "2025-01-02", qty: "10", costEur: "100.00", pricePerUnitEur: "10.00", pctOfTotal: 100, gainPct: 12 }],
  dividendsYtdEur: 3,
  dividendsTotalEur: 12,
  dividendsTotalCount: 4,
  yieldOnCostPct: 2.5,
  daysHeld: 300,
  transactions: [
    { date: "2025-01-02", side: "buy", qty: 10, priceNative: 11, currency: "USD", amountNative: -110, amountEur: -100, feeNative: 1 },
  ],
  meta: {
    source: "JUSTETF",
    assetKind: "etf",
    sector: null,
    industry: null,
    distribution: { policy: "DISTRIBUTING", frequency: "Quarterly" },
    terPct: "0.07",
    teilfreistellungPct: 30,
  },
};

const positionsData: PositionsData = {
  rows: [row],
  rowsByKind: { stock: [], etf: [row], bond: [], other: [] },
  total: 1,
  totalMarketEur: 500,
  totalPlEur: 5,
  sectors: ["ETF"],
  cash: [{ currency: "EUR", amount: 6.1, amountEur: 6.1, flag: "🇪🇺" }],
  selected: null,
};

describe("API contracts — runtime validation", () => {
  it("accepts a correctly-shaped positions payload", () => {
    expect(positionsDataSchema.safeParse(positionsData).success).toBe(true);
    expect(selectedPositionSchema.safeParse(selected).success).toBe(true);
  });

  it("flags a drifted payload with the offending path", () => {
    const drifted = { ...row, qty: "10" }; // number → string drift
    const r = positionRowSchema.safeParse(drifted);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "qty")).toBe(true);
    }
  });

  it("catches a Date that survived to the client as a non-string", () => {
    // JSON.parse can never produce a Date — but a route handler unit-called
    // in tests could. The schema pins the wire type to string.
    const drifted = { ...row, quoteUpdatedAt: new Date() };
    expect(positionRowSchema.safeParse(drifted).success).toBe(false);
  });

  it("validates the tax response envelope shape", () => {
    const bad = { tax: {}, availableYears: [2025] };
    expect(taxResponseSchema.safeParse(bad).success).toBe(false);
  });
});

describe("fetchApi (client half)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("returns parsed data when the schema matches", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(row))) as never;
    const out = await fetchApi("/api/x", positionRowSchema);
    expect(out.symbol).toBe("SPY");
  });

  it("warns but still returns the payload on mismatch", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const drifted = { ...row, qty: "10" };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(drifted))) as never;
    const out = await fetchApi("/api/x", positionRowSchema);
    expect(out).toEqual(drifted); // graceful: raw payload handed through
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("qty");
  });

  it("throws on a non-2xx response", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as never;
    await expect(fetchApi("/api/x", positionRowSchema)).rejects.toThrow("500");
  });
});
