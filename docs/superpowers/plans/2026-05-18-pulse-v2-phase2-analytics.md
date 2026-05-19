# Pulse v2 Phase 2: Pure-Function Analytics Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 11 pure-function analytics modules under `src/lib/analytics/` with comprehensive tests covering equity curve computation, returns, risk metrics, dividends, benchmarks, and portfolio breakdown.

**Architecture:** Each module is a standalone TypeScript file exporting typed pure functions. All financial math uses `decimal.js`. No DB or I/O — callers pass all data in. Tests live under `tests/analytics/` using Vitest with the `@` alias pointing to `src/`.

**Tech Stack:** TypeScript, Vitest, decimal.js (already in `package.json`), Node test environment

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/analytics/sector-map.ts` | Static ticker→sector map + `classifySector` |
| `src/lib/analytics/currency-exposure.ts` | Group positions by currency, compute % share |
| `src/lib/analytics/sector-contribution.ts` | Group positions by sector, top symbols |
| `src/lib/analytics/equity-curve.ts` | Month-end NAV from holdings + closes + FX |
| `src/lib/analytics/returns.ts` | TWR, MWR (IRR), annualization, period return |
| `src/lib/analytics/risk.ts` | Volatility, Sharpe, Beta, Max Drawdown |
| `src/lib/analytics/monthly-heatmap.ts` | Year × month return matrix from equity curve |
| `src/lib/analytics/dividend-projection.ts` | TTM extrapolation + next-30-days upcoming |
| `src/lib/analytics/yield-on-cost.ts` | TTM dividends / cost basis |
| `src/lib/analytics/top-payers.ts` | Group + rank dividend payers by total |
| `src/lib/analytics/benchmark.ts` | Index closes to baseline + align to portfolio dates |
| `tests/analytics/sector-map.test.ts` | Tests for sector-map |
| `tests/analytics/currency-exposure.test.ts` | Tests for currency-exposure |
| `tests/analytics/sector-contribution.test.ts` | Tests for sector-contribution |
| `tests/analytics/equity-curve.test.ts` | Tests for equity-curve |
| `tests/analytics/returns.test.ts` | Tests for returns |
| `tests/analytics/risk.test.ts` | Tests for risk |
| `tests/analytics/monthly-heatmap.test.ts` | Tests for monthly-heatmap |
| `tests/analytics/dividend-projection.test.ts` | Tests for dividend-projection |
| `tests/analytics/yield-on-cost.test.ts` | Tests for yield-on-cost |
| `tests/analytics/top-payers.test.ts` | Tests for top-payers |
| `tests/analytics/benchmark.test.ts` | Tests for benchmark |

---

### Task 1: `sector-map.ts`

**Files:**
- Create: `src/lib/analytics/sector-map.ts`
- Create: `tests/analytics/sector-map.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/analytics/sector-map.test.ts
import { describe, expect, it } from "vitest";
import { classifySector, SECTOR_MAP, DEFAULT_SECTOR } from "@/lib/analytics/sector-map";

describe("classifySector", () => {
  it("returns the mapped sector for a known symbol", () => {
    expect(classifySector("NVDA")).toBe("Tech");
    expect(classifySector("JPM")).toBe("Financials");
    expect(classifySector("LLY")).toBe("Healthcare");
    expect(classifySector("TSLA")).toBe("Consumer");
    expect(classifySector("SPYW")).toBe("ETF");
  });

  it("returns 'Other' for an unknown symbol", () => {
    expect(classifySector("XYZ123")).toBe("Other");
    expect(classifySector("")).toBe("Other");
  });

  it("is case-sensitive: lowercase does not match", () => {
    expect(classifySector("nvda")).toBe("Other");
    expect(classifySector("Nvda")).toBe("Other");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test tests/analytics/sector-map.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/analytics/sector-map.ts
export const SECTOR_MAP: Record<string, string> = {
  // Tech
  NVDA: "Tech", AAPL: "Tech", MSFT: "Tech", GOOG: "Tech", GOOGL: "Tech",
  META: "Tech", ASML: "Tech", AMD: "Tech", TSM: "Tech", "0700": "Tech",
  CRM: "Tech", ORCL: "Tech", ADBE: "Tech", NFLX: "Tech",
  // Financials
  "BRK-B": "Financials",
  JPM: "Financials", BAC: "Financials", GS: "Financials", BNP: "Financials",
  V: "Financials", MA: "Financials",
  // Healthcare
  LLY: "Healthcare", "NOVO-B": "Healthcare", JNJ: "Healthcare", PFE: "Healthcare",
  UNH: "Healthcare", ABBV: "Healthcare",
  // Consumer
  NESN: "Consumer", COST: "Consumer", PG: "Consumer", KO: "Consumer",
  WMT: "Consumer", MCD: "Consumer", TSLA: "Consumer",
  BMW: "Consumer", VOW3: "Consumer", VOW: "Consumer",
  // Energy
  XOM: "Energy", SHEL: "Energy", CVX: "Energy", BP: "Energy",
  // Industrials
  GE: "Industrials", RHM: "Industrials", BA: "Industrials", CAT: "Industrials",
  // ETF
  SPYW: "ETF", VUSA: "ETF", VHYL: "ETF", XSX7: "ETF",
};

export const DEFAULT_SECTOR = "Other";

export function classifySector(symbol: string): string {
  return SECTOR_MAP[symbol] ?? DEFAULT_SECTOR;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test tests/analytics/sector-map.test.ts
```
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/sector-map.ts tests/analytics/sector-map.test.ts
git commit -m "feat(analytics): sector-map module with classifySector"
```

---

### Task 2: `currency-exposure.ts`

**Files:**
- Create: `src/lib/analytics/currency-exposure.ts`
- Create: `tests/analytics/currency-exposure.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/analytics/currency-exposure.test.ts
import { describe, expect, it } from "vitest";
import { computeCurrencyExposure } from "@/lib/analytics/currency-exposure";

describe("computeCurrencyExposure", () => {
  it("returns empty array for empty input", () => {
    expect(computeCurrencyExposure([])).toEqual([]);
  });

  it("single USD position → 100% USD", () => {
    const result = computeCurrencyExposure([{ currency: "USD", marketEur: 1000 }]);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("USD");
    expect(result[0].pct).toBe(100);
    expect(result[0].valueEur).toBe(1000);
  });

  it("mixed currencies → correct percentages and sorted desc by value", () => {
    const result = computeCurrencyExposure([
      { currency: "EUR", marketEur: 2000 },
      { currency: "USD", marketEur: 3000 },
      { currency: "GBP", marketEur: 1000 },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].code).toBe("USD");
    expect(result[0].pct).toBe(50);
    expect(result[1].code).toBe("EUR");
    expect(result[1].pct).toBe(33.3);
    expect(result[2].code).toBe("GBP");
    expect(result[2].pct).toBe(16.7);
  });

  it("skips positions with null marketEur", () => {
    const result = computeCurrencyExposure([
      { currency: "USD", marketEur: 1000 },
      { currency: "EUR", marketEur: null },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("USD");
  });

  it("attaches known flags", () => {
    const result = computeCurrencyExposure([
      { currency: "USD", marketEur: 100 },
      { currency: "EUR", marketEur: 100 },
      { currency: "GBP", marketEur: 100 },
      { currency: "HKD", marketEur: 100 },
      { currency: "CHF", marketEur: 100 },
      { currency: "JPY", marketEur: 100 },
      { currency: "XYZ", marketEur: 100 },
    ]);
    const byCode = Object.fromEntries(result.map((r) => [r.code, r.flag]));
    expect(byCode["USD"]).toBe("🇺🇸");
    expect(byCode["EUR"]).toBe("🇪🇺");
    expect(byCode["GBP"]).toBe("🇬🇧");
    expect(byCode["HKD"]).toBe("🇭🇰");
    expect(byCode["CHF"]).toBe("🇨🇭");
    expect(byCode["JPY"]).toBe("🇯🇵");
    expect(byCode["XYZ"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test tests/analytics/currency-exposure.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/analytics/currency-exposure.ts
import Decimal from "decimal.js";

export type CurrencyExposure = {
  code: string;
  pct: number;
  valueEur: number;
  flag?: string;
};

const FLAGS: Record<string, string> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  HKD: "🇭🇰",
  CHF: "🇨🇭",
  JPY: "🇯🇵",
};

export function computeCurrencyExposure(
  positions: { currency: string; marketEur: number | null }[],
): CurrencyExposure[] {
  const totals = new Map<string, Decimal>();

  for (const p of positions) {
    if (p.marketEur === null) continue;
    const prev = totals.get(p.currency) ?? new Decimal(0);
    totals.set(p.currency, prev.plus(p.marketEur));
  }

  if (totals.size === 0) return [];

  const grandTotal = [...totals.values()].reduce((a, b) => a.plus(b), new Decimal(0));

  const result: CurrencyExposure[] = [];
  for (const [code, value] of totals) {
    const pct = grandTotal.isZero()
      ? 0
      : value.div(grandTotal).mul(100).toDecimalPlaces(1).toNumber();
    const entry: CurrencyExposure = { code, pct, valueEur: value.toNumber() };
    if (FLAGS[code]) entry.flag = FLAGS[code];
    result.push(entry);
  }

  return result.sort((a, b) => b.valueEur - a.valueEur);
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test tests/analytics/currency-exposure.test.ts
```
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/currency-exposure.ts tests/analytics/currency-exposure.test.ts
git commit -m "feat(analytics): currency-exposure module"
```

---

### Task 3: `sector-contribution.ts`

**Files:**
- Create: `src/lib/analytics/sector-contribution.ts`
- Create: `tests/analytics/sector-contribution.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/analytics/sector-contribution.test.ts
import { describe, expect, it } from "vitest";
import { computeSectorContribution } from "@/lib/analytics/sector-contribution";

describe("computeSectorContribution", () => {
  it("returns empty array for empty input", () => {
    expect(computeSectorContribution([])).toEqual([]);
  });

  it("aggregates positions by sector and returns topSymbols", () => {
    const result = computeSectorContribution([
      { symbol: "AAPL", marketEur: 3000 },
      { symbol: "MSFT", marketEur: 2000 },
      { symbol: "GOOG", marketEur: 1000 },
      { symbol: "NVDA", marketEur: 500 },
      { symbol: "JPM", marketEur: 4000 },
    ]);
    const tech = result.find((r) => r.sector === "Tech");
    const fin = result.find((r) => r.sector === "Financials");
    expect(tech).toBeDefined();
    expect(tech!.valueEur).toBe(6500);
    expect(tech!.topSymbols).toEqual(["AAPL", "MSFT", "GOOG"]);
    expect(fin).toBeDefined();
    expect(fin!.valueEur).toBe(4000);
    expect(fin!.topSymbols).toEqual(["JPM"]);
    // sorted descending by value
    expect(result[0].sector).toBe("Financials");
    expect(result[1].sector).toBe("Tech");
  });

  it("unknown ticker maps to 'Other'", () => {
    const result = computeSectorContribution([{ symbol: "UNKNOWN123", marketEur: 500 }]);
    expect(result).toHaveLength(1);
    expect(result[0].sector).toBe("Other");
  });

  it("single sector → 100% of total", () => {
    const result = computeSectorContribution([
      { symbol: "AAPL", marketEur: 1000 },
      { symbol: "MSFT", marketEur: 1000 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].pctOfTotal).toBe(100);
  });

  it("skips null marketEur entries", () => {
    const result = computeSectorContribution([
      { symbol: "AAPL", marketEur: 1000 },
      { symbol: "MSFT", marketEur: null },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].valueEur).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test tests/analytics/sector-contribution.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/analytics/sector-contribution.ts
import Decimal from "decimal.js";
import { classifySector } from "./sector-map";

export type SectorContribution = {
  sector: string;
  pctOfTotal: number;
  valueEur: number;
  topSymbols: string[];
};

export function computeSectorContribution(
  positions: { symbol: string; marketEur: number | null }[],
): SectorContribution[] {
  const sectorMap = new Map<string, { total: Decimal; symbols: { symbol: string; value: Decimal }[] }>();

  for (const p of positions) {
    if (p.marketEur === null) continue;
    const sector = classifySector(p.symbol);
    if (!sectorMap.has(sector)) {
      sectorMap.set(sector, { total: new Decimal(0), symbols: [] });
    }
    const entry = sectorMap.get(sector)!;
    entry.total = entry.total.plus(p.marketEur);
    entry.symbols.push({ symbol: p.symbol, value: new Decimal(p.marketEur) });
  }

  if (sectorMap.size === 0) return [];

  const grandTotal = [...sectorMap.values()].reduce((a, b) => a.plus(b.total), new Decimal(0));

  const result: SectorContribution[] = [];
  for (const [sector, { total, symbols }] of sectorMap) {
    const pctOfTotal = grandTotal.isZero()
      ? 0
      : total.div(grandTotal).mul(100).toDecimalPlaces(1).toNumber();
    const topSymbols = symbols
      .sort((a, b) => b.value.minus(a.value).toNumber())
      .slice(0, 3)
      .map((s) => s.symbol);
    result.push({ sector, pctOfTotal, valueEur: total.toNumber(), topSymbols });
  }

  return result.sort((a, b) => b.valueEur - a.valueEur);
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test tests/analytics/sector-contribution.test.ts
```
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/sector-contribution.ts tests/analytics/sector-contribution.test.ts
git commit -m "feat(analytics): sector-contribution module"
```

---

### Task 4: `equity-curve.ts`

**Files:**
- Create: `src/lib/analytics/equity-curve.ts`
- Create: `tests/analytics/equity-curve.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/analytics/equity-curve.test.ts
import { describe, expect, it } from "vitest";
import { computeEquityCurve } from "@/lib/analytics/equity-curve";
import type { EquityCurveInput } from "@/lib/analytics/equity-curve";

describe("computeEquityCurve", () => {
  it("returns empty array for empty monthEnds", () => {
    const input: EquityCurveInput = {
      monthEnds: [],
      holdings: {},
      closesBySymbolDate: new Map(),
      currencyBySymbol: new Map(),
      fxRates: new Map(),
    };
    expect(computeEquityCurve(input)).toEqual([]);
  });

  it("single EUR symbol single month", () => {
    const input: EquityCurveInput = {
      monthEnds: ["2024-01-31"],
      holdings: { "2024-01-31": { NESN: 10 } },
      closesBySymbolDate: new Map([["NESN|2024-01-31", 100]]),
      currencyBySymbol: new Map([["NESN", "EUR"]]),
      fxRates: new Map(),
    };
    const result = computeEquityCurve(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ date: "2024-01-31", valueEur: 1000 });
  });

  it("multi-month USD position with FX conversion", () => {
    // 10 shares at $100 each; USD→EUR rate is 1 EUR = 1.1 USD → value = 1000/1.1 ≈ 909.09
    const input: EquityCurveInput = {
      monthEnds: ["2024-01-31", "2024-02-29"],
      holdings: {
        "2024-01-31": { AAPL: 10 },
        "2024-02-29": { AAPL: 10 },
      },
      closesBySymbolDate: new Map([
        ["AAPL|2024-01-31", 100],
        ["AAPL|2024-02-29", 110],
      ]),
      currencyBySymbol: new Map([["AAPL", "USD"]]),
      fxRates: new Map([
        ["2024-01-31|USD", 1.1],
        ["2024-02-29|USD", 1.1],
      ]),
    };
    const result = computeEquityCurve(input);
    expect(result).toHaveLength(2);
    expect(result[0].valueEur).toBeCloseTo(909.09, 1);
    expect(result[1].valueEur).toBeCloseTo(1000, 1);
  });

  it("missing close → contributes 0 for that position", () => {
    const input: EquityCurveInput = {
      monthEnds: ["2024-01-31"],
      holdings: { "2024-01-31": { AAPL: 10, NESN: 5 } },
      closesBySymbolDate: new Map([["NESN|2024-01-31", 50]]),  // AAPL missing
      currencyBySymbol: new Map([["AAPL", "USD"], ["NESN", "EUR"]]),
      fxRates: new Map([["2024-01-31|USD", 1.1]]),
    };
    const result = computeEquityCurve(input);
    expect(result[0].valueEur).toBe(250); // only NESN
  });

  it("missing FX rate → contributes 0 for non-EUR position", () => {
    const input: EquityCurveInput = {
      monthEnds: ["2024-01-31"],
      holdings: { "2024-01-31": { AAPL: 10 } },
      closesBySymbolDate: new Map([["AAPL|2024-01-31", 100]]),
      currencyBySymbol: new Map([["AAPL", "USD"]]),
      fxRates: new Map(),  // no FX rate
    };
    const result = computeEquityCurve(input);
    expect(result[0].valueEur).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test tests/analytics/equity-curve.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/analytics/equity-curve.ts
import Decimal from "decimal.js";

export type EquityPoint = { date: string; valueEur: number };

export type EquityCurveInput = {
  monthEnds: string[];
  holdings: Record<string, Record<string, number>>;
  closesBySymbolDate: Map<string, number>;
  currencyBySymbol: Map<string, string>;
  fxRates: Map<string, number>;
};

export function computeEquityCurve(input: EquityCurveInput): EquityPoint[] {
  const { monthEnds, holdings, closesBySymbolDate, currencyBySymbol, fxRates } = input;

  if (monthEnds.length === 0) return [];

  return monthEnds.map((date) => {
    const positionsOnDate = holdings[date] ?? {};
    let total = new Decimal(0);

    for (const [symbol, qty] of Object.entries(positionsOnDate)) {
      const closeKey = `${symbol}|${date}`;
      const close = closesBySymbolDate.get(closeKey);
      if (close === undefined) continue;

      const currency = currencyBySymbol.get(symbol) ?? "EUR";

      let valueEur: Decimal;
      if (currency === "EUR") {
        valueEur = new Decimal(qty).mul(close);
      } else {
        const fxKey = `${date}|${currency}`;
        const fxRate = fxRates.get(fxKey);
        if (fxRate === undefined || fxRate === 0) continue;
        valueEur = new Decimal(qty).mul(close).div(fxRate);
      }

      total = total.plus(valueEur);
    }

    return { date, valueEur: total.toNumber() };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test tests/analytics/equity-curve.test.ts
```
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/equity-curve.ts tests/analytics/equity-curve.test.ts
git commit -m "feat(analytics): equity-curve module"
```

---

### Task 5: `returns.ts`

**Files:**
- Create: `src/lib/analytics/returns.ts`
- Create: `tests/analytics/returns.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/analytics/returns.test.ts
import { describe, expect, it } from "vitest";
import {
  periodReturn,
  monthlyReturns,
  twr,
  annualizedTwr,
  mwr,
} from "@/lib/analytics/returns";

describe("periodReturn", () => {
  it("returns 0 for empty array", () => {
    expect(periodReturn([])).toBe(0);
  });
  it("returns 0 if first value is 0", () => {
    expect(periodReturn([0, 100])).toBe(0);
  });
  it("returns 0.1 for [100, 110]", () => {
    expect(periodReturn([100, 110])).toBeCloseTo(0.1);
  });
  it("returns correct value for multi-element array", () => {
    expect(periodReturn([100, 90, 110])).toBeCloseTo(0.1);
  });
});

describe("monthlyReturns", () => {
  it("returns [] for empty array", () => {
    expect(monthlyReturns([])).toEqual([]);
  });
  it("returns [] for single element", () => {
    expect(monthlyReturns([100])).toEqual([]);
  });
  it("returns correct returns for two-element array", () => {
    expect(monthlyReturns([100, 110])).toHaveLength(1);
    expect(monthlyReturns([100, 110])[0]).toBeCloseTo(0.1);
  });
  it("computes step-by-step returns", () => {
    const result = monthlyReturns([100, 110, 99]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[1]).toBeCloseTo(-0.1);
  });
});

describe("twr", () => {
  it("returns 0 for empty array", () => {
    expect(twr([])).toBe(0);
  });
  it("[0.1, 0.1] → ~0.21", () => {
    expect(twr([0.1, 0.1])).toBeCloseTo(0.21);
  });
  it("[0.1, -0.1] → ~-0.01", () => {
    expect(twr([0.1, -0.1])).toBeCloseTo(-0.01);
  });
});

describe("annualizedTwr", () => {
  it("returns raw return for periodDays < 30", () => {
    expect(annualizedTwr(0.05, 20)).toBe(0.05);
  });
  it("0.10 over 365 days → ~0.10", () => {
    expect(annualizedTwr(0.1, 365)).toBeCloseTo(0.1, 3);
  });
  it("0.10 over 180 days → ~0.21", () => {
    // (1.1)^(365/180) - 1 ≈ 0.2095
    expect(annualizedTwr(0.1, 180)).toBeCloseTo(0.2095, 2);
  });
});

describe("mwr", () => {
  it("returns 0 for empty cashflows", () => {
    expect(mwr([], 0, "2024-12-31")).toBe(0);
  });
  it("returns 0 for single cashflow (< 2)", () => {
    expect(mwr([{ date: "2024-01-01", amount: -1000 }], 1100, "2024-12-31")).not.toBeNaN();
  });
  it("simple: deposit 100, ending value 110 after 365 days → ~0.10", () => {
    const result = mwr(
      [{ date: "2024-01-01", amount: -100 }],
      110,
      "2025-01-01",
    );
    expect(result).toBeCloseTo(0.1, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test tests/analytics/returns.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Note: MWR uses Newton-Raphson IRR. The cashflows array + ending value form the series. The ending value is treated as a positive cashflow on the ending date. Time is measured in years from the first date.

```typescript
// src/lib/analytics/returns.ts

export function periodReturn(values: number[]): number {
  if (values.length === 0 || values[0] === 0) return 0;
  return values[values.length - 1] / values[0] - 1;
}

export function monthlyReturns(values: number[]): number[] {
  if (values.length < 2) return [];
  const result: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    result.push(prev === 0 ? 0 : values[i] / prev - 1);
  }
  return result;
}

export function twr(returns: number[]): number {
  if (returns.length === 0) return 0;
  let product = 1;
  for (const r of returns) {
    product *= 1 + r;
  }
  return product - 1;
}

export function annualizedTwr(cumulativeReturn: number, periodDays: number): number {
  if (periodDays < 30) return cumulativeReturn;
  return Math.pow(1 + cumulativeReturn, 365 / periodDays) - 1;
}

export function mwr(
  cashflows: { date: string; amount: number }[],
  endingValue: number,
  endingDate: string,
): number {
  if (cashflows.length < 1) return 0;

  // Build full series: original cashflows + ending value as positive inflow
  const allFlows = [
    ...cashflows,
    { date: endingDate, amount: endingValue },
  ];

  if (allFlows.length < 2) return 0;

  const firstDate = new Date(allFlows[0].date).getTime();

  // Convert dates to year fractions from first date
  const flows = allFlows.map((cf) => ({
    t: (new Date(cf.date).getTime() - firstDate) / (365.25 * 24 * 3600 * 1000),
    amount: cf.amount,
  }));

  // NPV function: sum(cf / (1 + r)^t)
  const npv = (r: number) =>
    flows.reduce((sum, cf) => sum + cf.amount / Math.pow(1 + r, cf.t), 0);

  const dnpv = (r: number) =>
    flows.reduce(
      (sum, cf) => sum - (cf.t * cf.amount) / Math.pow(1 + r, cf.t + 1),
      0,
    );

  // Newton-Raphson
  let r = 0.1;
  for (let i = 0; i < 50; i++) {
    const f = npv(r);
    const df = dnpv(r);
    if (df === 0) return 0;
    const next = r - f / df;
    if (Math.abs(next - r) < 1e-8) return isFinite(next) ? next : 0;
    r = next;
  }

  return isFinite(r) ? r : 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test tests/analytics/returns.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/returns.ts tests/analytics/returns.test.ts
git commit -m "feat(analytics): returns module (TWR, MWR, annualization)"
```

---

### Task 6: `risk.ts`

**Files:**
- Create: `src/lib/analytics/risk.ts`
- Create: `tests/analytics/risk.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/analytics/risk.test.ts
import { describe, expect, it } from "vitest";
import { volatility, sharpe, beta, maxDrawdown } from "@/lib/analytics/risk";

describe("volatility", () => {
  it("returns 0 for empty array", () => {
    expect(volatility([])).toBe(0);
  });
  it("returns 0 for single element", () => {
    expect(volatility([0.05])).toBe(0);
  });
  it("returns 0 for constant series", () => {
    expect(volatility([0.05, 0.05, 0.05, 0.05])).toBe(0);
  });
  it("[0.05, -0.05, 0.05, -0.05] → ~0.173", () => {
    // stddev of alternating ±0.05 is 0.05, annualized = 0.05 * sqrt(12) ≈ 0.1732
    expect(volatility([0.05, -0.05, 0.05, -0.05])).toBeCloseTo(0.1732, 2);
  });
});

describe("sharpe", () => {
  it("0.1 return, 0.1 vol, 0 rf → 1.0", () => {
    expect(sharpe(0.1, 0.1)).toBeCloseTo(1.0);
  });
  it("returns 0 when volatility is 0", () => {
    expect(sharpe(0.1, 0)).toBe(0);
  });
  it("custom risk-free rate", () => {
    expect(sharpe(0.1, 0.1, 0.02)).toBeCloseTo(0.8);
  });
});

describe("beta", () => {
  it("returns 0 for empty arrays", () => {
    expect(beta([], [])).toBe(0);
  });
  it("identical series → beta of 1.0", () => {
    const series = [0.05, -0.03, 0.08, -0.02];
    expect(beta(series, series)).toBeCloseTo(1.0);
  });
  it("anti-correlated series → beta of -1.0", () => {
    const port = [0.05, -0.03, 0.08];
    const bench = [-0.05, 0.03, -0.08];
    expect(beta(port, bench)).toBeCloseTo(-1.0);
  });
  it("returns 0 when benchmark has zero variance", () => {
    expect(beta([0.05, 0.05, 0.05], [0.03, 0.03, 0.03])).toBe(0);
  });
});

describe("maxDrawdown", () => {
  it("returns 0 for empty array", () => {
    expect(maxDrawdown([])).toBe(0);
  });
  it("returns 0 for single-element array", () => {
    expect(maxDrawdown([100])).toBe(0);
  });
  it("all-rising series → 0 drawdown", () => {
    expect(maxDrawdown([100, 110, 120])).toBe(0);
  });
  it("[100, 120, 100, 110] → ≈ -0.1667", () => {
    // peak at 120, trough at 100 → (100/120)-1 = -0.1667
    expect(maxDrawdown([100, 120, 100, 110])).toBeCloseTo(-1 / 6, 3);
  });
  it("multi-trough takes worst", () => {
    // peak 120, troughs: 100 (−16.7%), 60 (−50%)
    expect(maxDrawdown([100, 120, 100, 80, 60, 90])).toBeCloseTo(-0.5, 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test tests/analytics/risk.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/analytics/risk.ts

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
}

function stddev(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

export function volatility(monthlyReturns: number[]): number {
  if (monthlyReturns.length < 2) return 0;
  const sd = stddev(monthlyReturns);
  return sd * Math.sqrt(12);
}

export function sharpe(
  annualizedReturn: number,
  volatilityValue: number,
  riskFreeRate = 0,
): number {
  if (volatilityValue === 0) return 0;
  return (annualizedReturn - riskFreeRate) / volatilityValue;
}

export function beta(portfolioReturns: number[], benchmarkReturns: number[]): number {
  if (portfolioReturns.length === 0 || benchmarkReturns.length === 0) return 0;
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  const port = portfolioReturns.slice(0, n);
  const bench = benchmarkReturns.slice(0, n);

  const benchVar = variance(bench);
  if (benchVar === 0) return 0;

  const mPort = mean(port);
  const mBench = mean(bench);

  const cov =
    port.reduce((sum, p, i) => sum + (p - mPort) * (bench[i] - mBench), 0) /
    (n - 1);

  return cov / benchVar;
}

export function maxDrawdown(values: number[]): number {
  if (values.length < 2) return 0;
  let peak = values[0];
  let maxDD = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = peak === 0 ? 0 : v / peak - 1;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test tests/analytics/risk.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/risk.ts tests/analytics/risk.test.ts
git commit -m "feat(analytics): risk module (volatility, sharpe, beta, maxDrawdown)"
```

---

### Task 7: `monthly-heatmap.ts`

**Files:**
- Create: `src/lib/analytics/monthly-heatmap.ts`
- Create: `tests/analytics/monthly-heatmap.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/analytics/monthly-heatmap.test.ts
import { describe, expect, it } from "vitest";
import { buildMonthlyHeatmap } from "@/lib/analytics/monthly-heatmap";

describe("buildMonthlyHeatmap", () => {
  it("returns empty array for empty input", () => {
    expect(buildMonthlyHeatmap([])).toEqual([]);
  });

  it("one full year of 13 month-ends → 1 row with 12 returns", () => {
    // 13 points = 12 returns for Jan–Dec 2024
    const points = Array.from({ length: 13 }, (_, i) => {
      const month = String(i + 1).padStart(2, "0");
      // Use Jan 2024 to Jan 2025
      const date = i < 12 ? `2024-${month}-28` : "2025-01-28";
      return { date, valueEur: 1000 + i * 10 };
    });
    const result = buildMonthlyHeatmap(points);
    expect(result).toHaveLength(1); // only 2024 row (2025 has 0 returns so may not appear or appear as stub)
    const row2024 = result.find((r) => r.year === 2024);
    expect(row2024).toBeDefined();
    expect(row2024!.months).toHaveLength(12);
    // All returns should be slightly positive (~0.01)
    expect(row2024!.months[0]).toBeCloseTo(0.01, 2);
  });

  it("two years of data → two rows sorted ascending", () => {
    const points = [
      { date: "2023-12-31", valueEur: 1000 },
      { date: "2024-01-31", valueEur: 1100 },
      { date: "2024-02-29", valueEur: 1050 },
      { date: "2024-12-31", valueEur: 1200 },
      { date: "2025-01-31", valueEur: 1300 },
    ];
    const result = buildMonthlyHeatmap(points);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].year).toBeLessThan(result[1].year);
    const row2024 = result.find((r) => r.year === 2024);
    expect(row2024).toBeDefined();
    expect(row2024!.months[0]).toBeCloseTo(0.1, 3); // Jan 2024: 1100/1000-1
  });

  it("gap in the middle → 0 for missing month", () => {
    const points = [
      { date: "2024-01-31", valueEur: 1000 },
      { date: "2024-02-29", valueEur: 1100 },
      // March missing
      { date: "2024-04-30", valueEur: 1200 },
    ];
    const result = buildMonthlyHeatmap(points);
    const row = result.find((r) => r.year === 2024);
    expect(row).toBeDefined();
    expect(row!.months[2]).toBe(0); // March (index 2) = 0
    expect(row!.months[3]).toBeCloseTo(1200 / 1100 - 1, 3); // April uses Feb as prior
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test tests/analytics/monthly-heatmap.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

The logic: iterate consecutive point pairs. Each pair gives a return for the month of `points[i+1]`. The year of the return is the year of the second point. Month index = month-1 (0-based).

```typescript
// src/lib/analytics/monthly-heatmap.ts

export type HeatmapRow = { year: number; months: number[] };

export function buildMonthlyHeatmap(
  points: { date: string; valueEur: number }[],
): HeatmapRow[] {
  if (points.length < 2) return [];

  // Sort by date just in case
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

  // year → [12 entries]
  const rows = new Map<number, number[]>();

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const ret = prev.valueEur === 0 ? 0 : curr.valueEur / prev.valueEur - 1;

    const year = parseInt(curr.date.slice(0, 4), 10);
    const month = parseInt(curr.date.slice(5, 7), 10) - 1; // 0-based

    if (!rows.has(year)) {
      rows.set(year, Array(12).fill(0));
    }
    rows.get(year)![month] = ret;
  }

  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, months]) => ({ year, months }));
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test tests/analytics/monthly-heatmap.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/monthly-heatmap.ts tests/analytics/monthly-heatmap.test.ts
git commit -m "feat(analytics): monthly-heatmap module"
```

---

### Task 8: `dividend-projection.ts`

**Files:**
- Create: `src/lib/analytics/dividend-projection.ts`
- Create: `tests/analytics/dividend-projection.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/analytics/dividend-projection.test.ts
import { describe, expect, it } from "vitest";
import { projectDividends } from "@/lib/analytics/dividend-projection";

describe("projectDividends", () => {
  it("empty ttm → all zeros", () => {
    const result = projectDividends([]);
    expect(result).toEqual({ yearEur: 0, next30DaysEur: 0, next30Count: 0 });
  });

  it("12 months of €100/month → yearEur ≈ 1200", () => {
    const dividends = Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, "0");
      return { date: `2024-${month}-15`, amountEur: 100 };
    });
    const asOf = new Date("2025-01-01");
    const result = projectDividends(dividends, [], asOf);
    expect(result.yearEur).toBeCloseTo(1200, 0);
  });

  it("partial 6 months of €100/month → yearEur ≈ 1200 (linear extrapolation)", () => {
    // 6 months × €100 = €600 over ~180 days → annualized = 600 * (365/180) ≈ 1217
    const dividends = Array.from({ length: 6 }, (_, i) => {
      const month = String(i + 1).padStart(2, "0");
      return { date: `2024-${month}-15`, amountEur: 100 };
    });
    const asOf = new Date("2024-07-15");
    const result = projectDividends(dividends, [], asOf);
    expect(result.yearEur).toBeGreaterThan(1000);
    expect(result.yearEur).toBeLessThan(1400);
  });

  it("< 90 days of data → yearEur = 0", () => {
    const dividends = [
      { date: "2024-01-15", amountEur: 100 },
      { date: "2024-02-15", amountEur: 100 },
    ]; // ~31 days span
    const asOf = new Date("2024-03-01");
    const result = projectDividends(dividends, [], asOf);
    expect(result.yearEur).toBe(0);
  });

  it("upcoming list filters to next 30 days", () => {
    const asOf = new Date("2024-06-01");
    const upcoming = [
      { date: "2024-06-15", amountEur: 50 },  // within 30 days
      { date: "2024-06-30", amountEur: 75 },  // within 30 days
      { date: "2024-07-10", amountEur: 100 }, // beyond 30 days
    ];
    const result = projectDividends([], upcoming, asOf);
    expect(result.next30DaysEur).toBeCloseTo(125, 0);
    expect(result.next30Count).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test tests/analytics/dividend-projection.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/analytics/dividend-projection.ts
import Decimal from "decimal.js";

export type DividendProjection = {
  yearEur: number;
  next30DaysEur: number;
  next30Count: number;
};

export function projectDividends(
  ttmDividends: { date: string; amountEur: number }[],
  upcoming: { date: string; amountEur: number }[] = [],
  asOf: Date = new Date(),
): DividendProjection {
  // Compute next30
  const cutoff = new Date(asOf.getTime() + 30 * 24 * 3600 * 1000);
  const next30 = upcoming.filter((u) => {
    const d = new Date(u.date);
    return d > asOf && d <= cutoff;
  });
  const next30DaysEur = next30.reduce((s, u) => s + u.amountEur, 0);
  const next30Count = next30.length;

  if (ttmDividends.length === 0) {
    return { yearEur: 0, next30DaysEur, next30Count };
  }

  const sorted = [...ttmDividends].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = new Date(sorted[0].date).getTime();
  const lastDate = new Date(sorted[sorted.length - 1].date).getTime();
  const spanDays = (lastDate - firstDate) / (24 * 3600 * 1000);

  if (spanDays < 90) {
    return { yearEur: 0, next30DaysEur, next30Count };
  }

  const totalEur = sorted.reduce(
    (s, d) => s.plus(d.amountEur),
    new Decimal(0),
  );

  // Linear extrapolation: annualize based on actual span
  const yearEur = totalEur.mul(365).div(spanDays).toNumber();

  return { yearEur, next30DaysEur, next30Count };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test tests/analytics/dividend-projection.test.ts
```
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/dividend-projection.ts tests/analytics/dividend-projection.test.ts
git commit -m "feat(analytics): dividend-projection module"
```

---

### Task 9: `yield-on-cost.ts`

**Files:**
- Create: `src/lib/analytics/yield-on-cost.ts`
- Create: `tests/analytics/yield-on-cost.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/analytics/yield-on-cost.test.ts
import { describe, expect, it } from "vitest";
import { yieldOnCost } from "@/lib/analytics/yield-on-cost";

describe("yieldOnCost", () => {
  it("1000 / 50000 → 0.02", () => {
    expect(yieldOnCost(1000, 50000)).toBeCloseTo(0.02);
  });
  it("0 / 1000 → 0", () => {
    expect(yieldOnCost(0, 1000)).toBe(0);
  });
  it("100 / 0 → 0 (guard against division by zero)", () => {
    expect(yieldOnCost(100, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test tests/analytics/yield-on-cost.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/analytics/yield-on-cost.ts
import Decimal from "decimal.js";

export function yieldOnCost(
  ttmDividendsEur: number,
  totalCostBasisEur: number,
): number {
  if (totalCostBasisEur === 0) return 0;
  return new Decimal(ttmDividendsEur).div(totalCostBasisEur).toNumber();
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test tests/analytics/yield-on-cost.test.ts
```
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/yield-on-cost.ts tests/analytics/yield-on-cost.test.ts
git commit -m "feat(analytics): yield-on-cost module"
```

---

### Task 10: `top-payers.ts`

**Files:**
- Create: `src/lib/analytics/top-payers.ts`
- Create: `tests/analytics/top-payers.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/analytics/top-payers.test.ts
import { describe, expect, it } from "vitest";
import { topDividendPayers } from "@/lib/analytics/top-payers";

describe("topDividendPayers", () => {
  it("returns empty array for empty input", () => {
    expect(topDividendPayers([])).toEqual([]);
  });

  it("single ticker → 1 entry", () => {
    const result = topDividendPayers([
      { ticker: "AAPL", amountEur: 50 },
      { ticker: "AAPL", amountEur: 75 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ ticker: "AAPL", totalEur: 125, count: 2 });
  });

  it("multiple tickers grouped and sorted by totalEur desc", () => {
    const result = topDividendPayers([
      { ticker: "MSFT", amountEur: 100 },
      { ticker: "AAPL", amountEur: 200 },
      { ticker: "MSFT", amountEur: 150 },
      { ticker: "GOOG", amountEur: 80 },
    ]);
    expect(result[0].ticker).toBe("MSFT"); // 250
    expect(result[1].ticker).toBe("AAPL"); // 200
    expect(result[2].ticker).toBe("GOOG"); // 80
  });

  it("ties broken by ticker ascending", () => {
    const result = topDividendPayers([
      { ticker: "ZZZ", amountEur: 100 },
      { ticker: "AAA", amountEur: 100 },
    ]);
    expect(result[0].ticker).toBe("AAA");
    expect(result[1].ticker).toBe("ZZZ");
  });

  it("limit is respected (default 5)", () => {
    const divs = Array.from({ length: 10 }, (_, i) => ({
      ticker: `T${i}`,
      amountEur: 100 - i,
    }));
    const result = topDividendPayers(divs);
    expect(result).toHaveLength(5);
  });

  it("custom limit", () => {
    const divs = Array.from({ length: 10 }, (_, i) => ({
      ticker: `T${i}`,
      amountEur: 100,
    }));
    expect(topDividendPayers(divs, 3)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test tests/analytics/top-payers.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/analytics/top-payers.ts
import Decimal from "decimal.js";

export type TopPayer = { ticker: string; totalEur: number; count: number };

export function topDividendPayers(
  dividends: { ticker: string; amountEur: number }[],
  limit = 5,
): TopPayer[] {
  if (dividends.length === 0) return [];

  const map = new Map<string, { total: Decimal; count: number }>();

  for (const d of dividends) {
    const prev = map.get(d.ticker) ?? { total: new Decimal(0), count: 0 };
    map.set(d.ticker, { total: prev.total.plus(d.amountEur), count: prev.count + 1 });
  }

  const result: TopPayer[] = [...map.entries()].map(([ticker, { total, count }]) => ({
    ticker,
    totalEur: total.toNumber(),
    count,
  }));

  result.sort((a, b) => {
    if (b.totalEur !== a.totalEur) return b.totalEur - a.totalEur;
    return a.ticker.localeCompare(b.ticker);
  });

  return result.slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test tests/analytics/top-payers.test.ts
```
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/top-payers.ts tests/analytics/top-payers.test.ts
git commit -m "feat(analytics): top-payers module"
```

---

### Task 11: `benchmark.ts`

**Files:**
- Create: `src/lib/analytics/benchmark.ts`
- Create: `tests/analytics/benchmark.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/analytics/benchmark.test.ts
import { describe, expect, it } from "vitest";
import { indexToBaseline, alignBenchmarkToCurve } from "@/lib/analytics/benchmark";

describe("indexToBaseline", () => {
  it("returns empty for empty input", () => {
    expect(indexToBaseline([], [])).toEqual({ dates: [], values: [] });
  });

  it("[100, 110] with default baseline=100 → [100, 110]", () => {
    const result = indexToBaseline([100, 110], ["2024-01-31", "2024-02-29"]);
    expect(result.values[0]).toBe(100);
    expect(result.values[1]).toBe(110);
  });

  it("[200, 220, 180] → [100, 110, 90]", () => {
    const result = indexToBaseline(
      [200, 220, 180],
      ["2024-01-31", "2024-02-29", "2024-03-31"],
    );
    expect(result.values[0]).toBe(100);
    expect(result.values[1]).toBeCloseTo(110);
    expect(result.values[2]).toBeCloseTo(90);
  });

  it("custom baseline", () => {
    const result = indexToBaseline([100, 110], ["2024-01-31", "2024-02-29"], 1000);
    expect(result.values[0]).toBe(1000);
    expect(result.values[1]).toBe(1100);
  });
});

describe("alignBenchmarkToCurve", () => {
  it("returns empty for empty portfolio points", () => {
    expect(alignBenchmarkToCurve([], [])).toEqual({ dates: [], values: [] });
  });

  it("exact date match", () => {
    const portfolio = [
      { date: "2024-01-31", valueEur: 1000 },
      { date: "2024-02-29", valueEur: 1100 },
    ];
    const benchmark = [
      { date: "2024-01-31", close: 100 },
      { date: "2024-02-29", close: 110 },
    ];
    const result = alignBenchmarkToCurve(portfolio, benchmark);
    expect(result.values[0]).toBe(100);
    expect(result.values[1]).toBe(110);
  });

  it("gaps in benchmark → forward-filled from last available close", () => {
    const portfolio = [
      { date: "2024-01-31", valueEur: 1000 },
      { date: "2024-02-29", valueEur: 1100 },
      { date: "2024-03-31", valueEur: 1200 },
    ];
    const benchmark = [
      { date: "2024-01-31", close: 100 },
      // Feb missing
      { date: "2024-03-31", close: 110 },
    ];
    const result = alignBenchmarkToCurve(portfolio, benchmark);
    expect(result.values[0]).toBeCloseTo(100); // Jan baseline
    expect(result.values[1]).toBeCloseTo(100); // Feb forward-filled from Jan close
    expect(result.values[2]).toBeCloseTo(110); // Mar — actual value
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test tests/analytics/benchmark.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/analytics/benchmark.ts

export type IndexedSeries = { dates: string[]; values: number[] };

export function indexToBaseline(
  closes: number[],
  dates: string[],
  baseline = 100,
): IndexedSeries {
  if (closes.length === 0) return { dates: [], values: [] };

  const first = closes[0];
  if (first === 0) return { dates: dates.slice(), values: closes.map(() => baseline) };

  const values = closes.map((c) => (baseline * c) / first);
  return { dates: dates.slice(), values };
}

export function alignBenchmarkToCurve(
  portfolioPoints: { date: string; valueEur: number }[],
  benchmarkRows: { date: string; close: number }[],
): IndexedSeries {
  if (portfolioPoints.length === 0) return { dates: [], values: [] };

  // Build a date→close lookup
  const closeByDate = new Map<string, number>(
    benchmarkRows.map((r) => [r.date, r.close]),
  );

  // Forward-fill: for each portfolio date, find the most recent available benchmark close
  const sortedBenchDates = [...closeByDate.keys()].sort();

  const alignedCloses: number[] = [];
  const alignedDates: string[] = [];

  let lastKnownClose: number | undefined;

  for (const p of portfolioPoints) {
    // find latest bench date <= p.date
    let best: number | undefined = closeByDate.get(p.date);
    if (best === undefined) {
      // forward-fill: use lastKnownClose or scan for closest earlier date
      for (const bd of sortedBenchDates) {
        if (bd <= p.date) {
          best = closeByDate.get(bd);
        } else {
          break;
        }
      }
    }
    if (best !== undefined) lastKnownClose = best;
    alignedCloses.push(lastKnownClose ?? 0);
    alignedDates.push(p.date);
  }

  return indexToBaseline(alignedCloses, alignedDates);
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test tests/analytics/benchmark.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/benchmark.ts tests/analytics/benchmark.test.ts
git commit -m "feat(analytics): benchmark module (indexToBaseline, alignBenchmarkToCurve)"
```

---

### Task 12: Final verification and consolidated commit

**Files:** No new files. Runs verification checks only.

- [ ] **Step 1: Run all tests**

```
pnpm test 2>&1 | tail -15
```
Expected: All 109 prior tests pass plus ~40 new tests (total ~149+).

- [ ] **Step 2: Typecheck**

```
pnpm typecheck 2>&1 | tail -5
```
Expected: No errors.

- [ ] **Step 3: Build check**

```powershell
$env:DATABASE_URL = (Get-Content .env.local | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=', '' -replace '"', ''
$env:BETTER_AUTH_SECRET = "local-build-only-secret-at-least-32-chars"
pnpm build 2>&1 | Select-Object -Last 15
```
Expected: Build completes without errors.

- [ ] **Step 4: Create consolidated commit if all pass**

```bash
git add src/lib/analytics tests/analytics
git commit -m "feat(analytics): pure-function modules for equity curve, returns, risk, etc."
```
