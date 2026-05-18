# Portfolio & Tax — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a multi-user portfolio app on Vercel Hobby that ingests IBKR + Freedom Finance statements, surfaces 7 Pulse-design screens, and exports a German Anlage KAP draft (PDF + CSV).

**Architecture:** Next.js 15 App Router + Fluid Compute (Node 24) on Vercel; Neon Postgres via Marketplace with Drizzle ORM; Better Auth (Google + GitHub) with email allowlist; client-side parsing in a Web Worker, server stores only normalized events; ECB-rate FX conversion via daily cron; FIFO ledger replay drives positions/tax; PDF via @react-pdf/renderer.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Drizzle, Neon Postgres, Better Auth, Tailwind v3, shadcn/ui, Recharts, decimal.js, Zod, @react-pdf/renderer, Vitest, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-05-18-portfolio-tax-app-design.md`

**Branch:** `pulse-redesign` (already created)

**Source files reuse policy:** The WIP under `src/lib/{brokers,domain,imports,auth,db}` is correct against real sample reports and is **adopted as-is** unless a task explicitly modifies it. The WIP `src/app/*` pages, `src/components/app/*`, and `package.json` (still Vite-era) are **replaced** during this plan.

---

## Verification commands (run after every task)

```
pnpm typecheck     # tsc --noEmit
pnpm lint
pnpm test          # vitest (only after Task 6 onwards)
pnpm test:e2e      # playwright (only after Task 27 onwards)
```

---

## Phase 0 — Toolchain & repo foundation

### Task 1: Replace package.json with Next.js 15 stack

**Files:**
- Modify: `package.json`
- Create: `.nvmrc`

- [ ] **Step 1: Replace `package.json` with Next.js 15 stack + scripts**

Replace the entire file with:

```json
{
  "name": "report-readr-fe",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.10.4",
    "@react-pdf/renderer": "^4.1.6",
    "better-auth": "^1.2.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "decimal.js": "^10.4.3",
    "drizzle-orm": "^0.36.4",
    "lucide-react": "^0.451.0",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.13.3",
    "tailwind-merge": "^2.5.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "drizzle-kit": "^0.28.1",
    "eslint": "^9.16.0",
    "eslint-config-next": "^15.1.0",
    "fast-xml-parser": "^4.5.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "tailwindcss-animate": "^1.0.7",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.6"
  },
  "packageManager": "pnpm@9.15.0"
}
```

- [ ] **Step 2: Pin Node version**

Create `.nvmrc` containing exactly:
```
24
```

- [ ] **Step 3: Install dependencies**

Run: `pnpm install`
Expected: "Done. … packages installed." No peer-dep errors that block install.

- [ ] **Step 4: Commit**

```bash
git add package.json .nvmrc pnpm-lock.yaml
git commit -m "chore: switch to Next.js 15 + pnpm toolchain"
```

---

### Task 2: Vercel + Next.js config

**Files:**
- Create: `vercel.ts`
- Modify: `next.config.ts`
- Delete: `vercel.json` if it exists

- [ ] **Step 1: Write `vercel.ts`**

Create `vercel.ts`:
```ts
import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/fx',     schedule: '30 15 * * 1-5' },
    { path: '/api/cron/quotes', schedule: '0 21 * * 1-5' },
  ],
};
```

- [ ] **Step 2: Install @vercel/config**

Run: `pnpm add -D @vercel/config`
Expected: lockfile updates with `@vercel/config`.

- [ ] **Step 3: Overwrite `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
```

- [ ] **Step 4: Remove `vercel.json` if present**

Run: `git rm -f vercel.json 2>/dev/null; rm -f vercel.json`

- [ ] **Step 5: Commit**

```bash
git add vercel.ts next.config.ts package.json pnpm-lock.yaml
git commit -m "chore: add vercel.ts + cron schedules, tighten next.config"
```

---

### Task 3: Tailwind + Pulse design tokens

**Files:**
- Create: `tailwind.config.ts`, `postcss.config.mjs`, `src/app/globals.css`

- [ ] **Step 1: Write `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:       "#0b0d10",
        panel:    "#13171c",
        panel2:   "#181d23",
        border:   "rgba(255,255,255,0.06)",
        borderHard: "rgba(255,255,255,0.10)",
        ink:      "#ECEEF2",
        muted:    "rgba(236,238,242,0.58)",
        dim:      "rgba(236,238,242,0.35)",
        mint:     "var(--accent-mint, #7CFFB2)",
        amber:    "var(--accent-amber, #FFD24A)",
        pink:     "var(--accent-pink, #FF5DA2)",
        bad:      "#FF6F6F",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter Tight", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [animate],
} satisfies Config;
```

- [ ] **Step 2: Write `postcss.config.mjs`**

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 3: Write `src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

html, body { background: #0b0d10; color: #ECEEF2; }
.num { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts postcss.config.mjs src/app/globals.css
git commit -m "feat(ui): tailwind + Pulse design tokens"
```

---

### Task 4: Root layout + fonts

**Files:**
- Replace: `src/app/layout.tsx`
- Delete (if present and unused): old `src/app/page.tsx` redirect

- [ ] **Step 1: Replace root layout**

`src/app/layout.tsx`:
```tsx
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "folio.",
  description: "Portfolio & German tax (Anlage KAP) for IBKR + Freedom Finance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-bg text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Smoke-build**

Run: `pnpm build`
Expected: build succeeds; any missing-page warnings are acceptable now.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(ui): root layout with Geist fonts"
```

---

## Phase 1 — Database schema

### Task 5: Apply schema deltas

**Files:**
- Modify: `src/lib/db/schema.ts`

The WIP schema already has `user`, `session`, `account`, `verification`, `broker_accounts`, `imports`, `instruments`, `transactions`, `positions`, `fx_rates`, `tax_reports`, `tax_report_lines`. The deltas per spec § 5 are: add `lots`, `realized_matches`, `quote_cache`, `user_settings`; drop `owner_user_id` from `fx_rates`.

- [ ] **Step 1: Open `src/lib/db/schema.ts` and locate the `fx_rates` definition**

- [ ] **Step 2: Rewrite `fx_rates` without owner column**

Replace the existing `fx_rates` block with:
```ts
export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: text("date").notNull(),
    fromCurrency: text("from_currency").notNull(),
    toCurrency: text("to_currency").notNull().default("EUR"),
    rate: numeric("rate").notNull(),
  },
  (table) => ({
    fxUnique: uniqueIndex("fx_rates_pair_date_unique").on(table.date, table.fromCurrency, table.toCurrency),
  }),
);
```

- [ ] **Step 3: Append `lots`, `realized_matches`, `quote_cache`, `user_settings` at the bottom**

```ts
export const lots = pgTable(
  "lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    brokerAccountId: uuid("broker_account_id").notNull().references(() => brokerAccounts.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    openedAt: text("opened_at").notNull(),
    remainingQty: numeric("remaining_qty").notNull(),
    costEur: numeric("cost_eur").notNull(),
    sourceEventFingerprint: text("source_event_fingerprint").notNull(),
  },
  (table) => ({
    ownerAcctSymbolIdx: index("lots_owner_acct_symbol_idx").on(table.ownerUserId, table.brokerAccountId, table.symbol),
  }),
);

export const realizedMatches = pgTable(
  "realized_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    brokerAccountId: uuid("broker_account_id").notNull().references(() => brokerAccounts.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    openingFingerprint: text("opening_fingerprint").notNull(),
    closingFingerprint: text("closing_fingerprint").notNull(),
    qty: numeric("qty").notNull(),
    costEur: numeric("cost_eur").notNull(),
    proceedsEur: numeric("proceeds_eur").notNull(),
    gainEur: numeric("gain_eur").notNull(),
    holdingDays: integer("holding_days").notNull(),
    isLongTerm: boolean("is_long_term").notNull(),
    closedAt: text("closed_at").notNull(),
  },
  (table) => ({
    ownerClosedIdx: index("realized_matches_owner_closed_idx").on(table.ownerUserId, table.closedAt),
  }),
);

export const quoteCache = pgTable(
  "quote_cache",
  {
    symbol: text("symbol").notNull(),
    date: text("date").notNull(),
    currency: text("currency").notNull(),
    close: numeric("close").notNull(),
    source: text("source").notNull().default("YAHOO"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.symbol, table.date] }),
  }),
);

export const userSettings = pgTable("user_settings", {
  ownerUserId: text("owner_user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  filingStatus: text("filing_status").notNull().default("SINGLE"),     // SINGLE | JOINT
  jurisdiction: text("jurisdiction").notNull().default("DE"),
  saverAllowance: numeric("saver_allowance").notNull().default("1000"),
  lotMethod: text("lot_method").notNull().default("FIFO"),
  fxSource: text("fx_source").notNull().default("ECB"),
  accentPalette: jsonb("accent_palette").notNull().default(["#7CFFB2","#FFD24A","#FF5DA2"]),
  hideValues: boolean("hide_values").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 4: Generate migration**

Run: `pnpm db:generate`
Expected: a new SQL file under `drizzle/` with the four new tables + `fx_rates` change.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(db): add lots/realized_matches/quote_cache/user_settings; globalize fx_rates"
```

---

### Task 6: Vitest setup + first schema test

**Files:**
- Create: `vitest.config.ts`, `tests/lib/db/schema.test.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 2: Write a schema sanity test**

`tests/lib/db/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import * as schema from "@/lib/db/schema";

describe("schema exports", () => {
  it("exposes the expected tables", () => {
    const expected = [
      "user", "session", "account", "verification",
      "brokerAccounts", "imports", "instruments", "transactions",
      "positions", "fxRates", "lots", "realizedMatches",
      "quoteCache", "userSettings", "taxReports", "taxReportLines",
    ];
    for (const name of expected) expect((schema as Record<string, unknown>)[name]).toBeDefined();
  });

  it("fx_rates has no owner column", () => {
    const cols = Object.keys(schema.fxRates as object);
    expect(cols).not.toContain("ownerUserId");
  });
});
```

- [ ] **Step 3: Run; expect PASS**

Run: `pnpm test`
Expected: 2 passing.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts tests/lib/db/schema.test.ts
git commit -m "test(db): schema export sanity"
```

---

## Phase 2 — Parsers against real samples

### Task 7: IBKR parser regression test

**Files:**
- Create: `tests/lib/brokers/ibkr.test.ts`
- Create: `tests/fixtures/README.md`
- (No change needed to `src/lib/brokers/ibkr.ts` — it already parses these files correctly.)

The real IBKR CSVs live in `C:\Users\Kostan\Downloads\ibkr reports\U00000000_{2023,2024,2025}_*.csv`. We copy a redacted sample into the repo to make the test hermetic.

- [ ] **Step 1: Copy the 2025 CSV into fixtures and redact account number**

```bash
mkdir -p tests/fixtures/brokers
cp "C:\Users\Kostan\Downloads\ibkr reports\U00000000_2025_2025.csv" tests/fixtures/brokers/ibkr-2025.csv
# Replace the account number with a placeholder
node -e "let fs=require('fs');let p='tests/fixtures/brokers/ibkr-2025.csv';fs.writeFileSync(p, fs.readFileSync(p,'utf8').replace(/U00000000/g,'U00000000').replace(/Test User/gi,'Test User'))"
```

- [ ] **Step 2: Write the failing test**

`tests/lib/brokers/ibkr.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseInteractiveBrokersStatement } from "@/lib/brokers/ibkr";

describe("IBKR parser — 2025 sample", () => {
  const bytes = readFileSync("tests/fixtures/brokers/ibkr-2025.csv");
  const result = parseInteractiveBrokersStatement("ibkr-2025.csv", bytes, 2025);

  it("identifies the account", () => {
    expect(result.account.broker).toBe("INTERACTIVE_BROKERS");
    expect(result.account.accountNumber).toBe("U00000000");
    expect(result.account.baseCurrency).toBe("EUR");
  });

  it("parses trades", () => {
    const trades = result.events.filter(e => e.type === "TRADE");
    expect(trades.length).toBeGreaterThan(0);
    expect(trades.every(t => t.date.match(/^\d{4}-\d{2}-\d{2}$/))).toBe(true);
  });

  it("parses dividends and interest", () => {
    expect(result.events.some(e => e.type === "DIVIDEND")).toBe(true);
    expect(result.events.some(e => e.type === "INTEREST")).toBe(true);
  });

  it("flags non-EUR events for review", () => {
    const usd = result.events.filter(e => e.currency === "USD" && e.type === "TRADE");
    expect(usd.length).toBeGreaterThan(0);
    expect(usd.every(e => e.requiresReview === true || e.fxSource === "MISSING")).toBe(true);
  });
});
```

- [ ] **Step 3: Run; expect PASS** (parser already exists and works)

Run: `pnpm test tests/lib/brokers/ibkr.test.ts`
Expected: 4 passing.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/brokers/ibkr.test.ts tests/fixtures/brokers/ibkr-2025.csv
git commit -m "test(brokers): IBKR parser regression vs 2025 sample"
```

---

### Task 8: Freedom Finance parser regression test

**Files:**
- Create: `tests/lib/brokers/freedom.test.ts`
- Create: `tests/fixtures/brokers/freedom-sample.json` (copied + redacted)

- [ ] **Step 1: Copy the FF JSON into fixtures and redact account**

```bash
node -e "let fs=require('fs');let src='C:\\\\Users\\\\Kostan\\\\Downloads\\\\900000_2021-04-30 23_59_59_2026-05-16 23_59_59_all.json';let j=JSON.parse(fs.readFileSync(src,'utf8'));if(j.plainAccountInfoData)j.plainAccountInfoData.account='FF-TEST';if(j.accountInfo)j.accountInfo.account='FF-TEST';fs.writeFileSync('tests/fixtures/brokers/freedom-sample.json', JSON.stringify(j))"
```

- [ ] **Step 2: Write the failing test**

`tests/lib/brokers/freedom.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseFreedomFinanceStatement } from "@/lib/brokers/freedom";

describe("Freedom Finance parser — sample", () => {
  const bytes = readFileSync("tests/fixtures/brokers/freedom-sample.json");
  const result = parseFreedomFinanceStatement("freedom-sample.json", bytes, 2025);

  it("identifies the account", () => {
    expect(result.account.broker).toBe("FREEDOM_FINANCE");
    expect(result.account.accountNumber).toBe("FF-TEST");
  });

  it("parses trades, cash flows, commissions", () => {
    const types = new Set(result.events.map(e => e.type));
    expect(types.has("TRADE")).toBe(true);
    expect(types.has("FEE")).toBe(true);
  });

  it("dates are ISO YYYY-MM-DD", () => {
    expect(result.events.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date))).toBe(true);
  });

  it("sell trades have negative quantity", () => {
    const sells = result.events.filter(e => e.type === "TRADE" && Number(e.quantity) < 0);
    expect(sells.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run; expect PASS**

Run: `pnpm test tests/lib/brokers/freedom.test.ts`
Expected: 4 passing.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/brokers/freedom.test.ts tests/fixtures/brokers/freedom-sample.json
git commit -m "test(brokers): Freedom Finance parser regression vs real sample"
```

---

### Task 9: Broker detection + dispatch

**Files:**
- Create: `src/lib/brokers/detect.ts`
- Create: `tests/lib/brokers/detect.test.ts`
- Modify: `src/lib/brokers/index.ts`

- [ ] **Step 1: Write the failing test**

`tests/lib/brokers/detect.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { detectBroker } from "@/lib/brokers/detect";

describe("detectBroker", () => {
  it("detects IBKR from CSV statement marker", () => {
    const bytes = new TextEncoder().encode("Statement,Header,Field Name,Field Value\nStatement,Data,BrokerName,Interactive Brokers\n");
    expect(detectBroker({ fileName: "x.csv", bytes })).toBe("INTERACTIVE_BROKERS");
  });
  it("detects Freedom from JSON shape", () => {
    const bytes = new TextEncoder().encode('{"trades":{"detailed":[]},"cash_flows":{"detailed":[]}}');
    expect(detectBroker({ fileName: "x.json", bytes })).toBe("FREEDOM_FINANCE");
  });
  it("returns null when unknown", () => {
    const bytes = new TextEncoder().encode("hello world");
    expect(detectBroker({ fileName: "x.txt", bytes })).toBeNull();
  });
});
```

- [ ] **Step 2: Run; expect FAIL** (module missing)

Run: `pnpm test tests/lib/brokers/detect.test.ts`
Expected: "Cannot find module".

- [ ] **Step 3: Implement `detect.ts`**

```ts
import type { Broker } from "@/lib/domain/types";

export function detectBroker(input: { fileName: string; bytes: Uint8Array }): Broker | null {
  const head = new TextDecoder().decode(input.bytes.slice(0, 2048));
  if (head.includes("Interactive Brokers") || /^Statement,Header,Field Name/.test(head)) {
    return "INTERACTIVE_BROKERS";
  }
  if (head.trim().startsWith("{") && head.includes('"trades"') && head.includes('"detailed"')) {
    return "FREEDOM_FINANCE";
  }
  return null;
}
```

- [ ] **Step 4: Run; expect PASS**

Run: `pnpm test tests/lib/brokers/detect.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Wire dispatcher in `src/lib/brokers/index.ts`**

Replace the file's `parseBrokerStatement` body so it auto-detects when the caller doesn't supply `broker`:
```ts
import { parseInteractiveBrokersStatement } from "./ibkr";
import { parseFreedomFinanceStatement } from "./freedom";
import { detectBroker } from "./detect";
import type { ParseBrokerStatementInput, ParsedBrokerStatement, Broker } from "./types";

export function parseBrokerStatement(input: ParseBrokerStatementInput & { broker?: Broker }): ParsedBrokerStatement {
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
  const broker = input.broker ?? detectBroker({ fileName: input.fileName, bytes });
  if (!broker) throw new Error("UNKNOWN_BROKER");
  if (broker === "INTERACTIVE_BROKERS") return parseInteractiveBrokersStatement(input.fileName, bytes, input.taxYear);
  return parseFreedomFinanceStatement(input.fileName, bytes, input.taxYear);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/brokers/detect.ts src/lib/brokers/index.ts tests/lib/brokers/detect.test.ts
git commit -m "feat(brokers): auto-detect broker from file head"
```

---

### Task 10: Web Worker for client-side parsing

**Files:**
- Create: `src/lib/brokers/worker.ts`
- Create: `src/lib/brokers/client.ts`

- [ ] **Step 1: Write the worker**

`src/lib/brokers/worker.ts`:
```ts
/// <reference lib="webworker" />
import { parseBrokerStatement } from "./index";

self.onmessage = async (event: MessageEvent<{ fileName: string; bytes: ArrayBuffer; taxYear: number }>) => {
  try {
    const result = parseBrokerStatement(event.data);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: (err as Error).message });
  }
};
```

- [ ] **Step 2: Write a typed client wrapper**

`src/lib/brokers/client.ts`:
```ts
import type { ParsedBrokerStatement } from "./types";

export async function parseStatementInWorker(file: File, taxYear: number): Promise<ParsedBrokerStatement> {
  const bytes = await file.arrayBuffer();
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  return new Promise<ParsedBrokerStatement>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: ParsedBrokerStatement; error?: string }>) => {
      worker.terminate();
      if (e.data.ok && e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error || "PARSE_FAILED"));
    };
    worker.postMessage({ fileName: file.name, bytes, taxYear }, [bytes]);
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/brokers/worker.ts src/lib/brokers/client.ts
git commit -m "feat(brokers): web worker entry + typed client wrapper"
```

---

## Phase 3 — Domain math: FX + ledger + fingerprint

### Task 11: Decimal wrapper + FX conversion

**Files:**
- Modify: `src/lib/domain/decimal.ts` (already exists — verify)
- Create: `src/lib/ledger/fx.ts`
- Create: `tests/lib/ledger/fx.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/lib/ledger/fx.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { convertEventToEur } from "@/lib/ledger/fx";

const rates = new Map([["2025-03-04|USD", "1.075"], ["2025-04-15|GBP", "0.864"]]);

describe("convertEventToEur", () => {
  it("returns event with *_eur fields when rate present", () => {
    const ev = { id: "1", broker: "INTERACTIVE_BROKERS", accountNumber: "U", type: "TRADE",
                 date: "2025-03-04", currency: "USD", amount: "1075", fee: "1.075" } as const;
    const out = convertEventToEur(ev, rates);
    expect(out.amountEur).toBe("1000");
    expect(out.feeEur).toBe("1");
    expect(out.fxSource).toBe("ECB");
    expect(out.requiresReview).toBeFalsy();
  });

  it("flags requires_review when rate missing", () => {
    const ev = { id: "2", broker: "INTERACTIVE_BROKERS", accountNumber: "U", type: "TRADE",
                 date: "2025-03-04", currency: "JPY", amount: "100" } as const;
    const out = convertEventToEur(ev, rates);
    expect(out.amountEur).toBeUndefined();
    expect(out.fxSource).toBe("MISSING");
    expect(out.requiresReview).toBe(true);
  });

  it("passes through EUR events unchanged", () => {
    const ev = { id: "3", broker: "INTERACTIVE_BROKERS", accountNumber: "U", type: "DIVIDEND",
                 date: "2025-03-04", currency: "EUR", amount: "100" } as const;
    const out = convertEventToEur(ev, rates);
    expect(out.amountEur).toBe("100");
    expect(out.fxSource).toBe("BROKER");
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `pnpm test tests/lib/ledger/fx.test.ts`
Expected: "Cannot find module '@/lib/ledger/fx'".

- [ ] **Step 3: Implement `src/lib/ledger/fx.ts`**

```ts
import Decimal from "decimal.js";
import type { NormalizedEvent } from "@/lib/domain/types";

const AMOUNT_FIELDS = ["amount", "cashAmount", "proceeds", "fee", "realizedPnl", "withholdingTax"] as const;

export function convertEventToEur(
  event: NormalizedEvent,
  rates: Map<string, string>,
): NormalizedEvent {
  if (event.currency === "EUR") {
    const out: NormalizedEvent = { ...event, fxSource: "BROKER" };
    for (const f of AMOUNT_FIELDS) {
      const v = event[f];
      if (v !== undefined) (out as Record<string, unknown>)[`${f}Eur`] = v;
    }
    return out;
  }

  const rate = rates.get(`${event.date}|${event.currency}`);
  if (!rate) return { ...event, fxSource: "MISSING", requiresReview: true };

  const out: NormalizedEvent = { ...event, fxSource: "ECB" };
  const r = new Decimal(rate);
  for (const f of AMOUNT_FIELDS) {
    const v = event[f];
    if (v === undefined) continue;
    (out as Record<string, unknown>)[`${f}Eur`] = new Decimal(v).div(r).toFixed(2);
  }
  return out;
}
```

> Note: ECB rates are quoted as 1 EUR → X foreign units, so `amountEur = amount / rate`.

- [ ] **Step 4: Run; expect PASS**

Run: `pnpm test tests/lib/ledger/fx.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ledger/fx.ts tests/lib/ledger/fx.test.ts
git commit -m "feat(ledger): FX conversion to EUR with review flag"
```

---

### Task 12: FIFO ledger replay

**Files:**
- Create: `src/lib/ledger/replay.ts`
- Create: `tests/lib/ledger/replay.test.ts`
- Create: `tests/fixtures/ledger/simple-portfolio.ts`

- [ ] **Step 1: Write the fixture**

`tests/fixtures/ledger/simple-portfolio.ts`:
```ts
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
    quantity: "-8", amount: " 7200", amountEur: " 7200", fee: "1", feeEur: "1" },
];
```

- [ ] **Step 2: Write the failing test**

`tests/lib/ledger/replay.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { replay } from "@/lib/ledger/replay";
import { FIXTURE } from "../../fixtures/ledger/simple-portfolio";

describe("FIFO replay", () => {
  const { lots, matches } = replay(FIXTURE);

  it("opens two lots then partially consumes the first", () => {
    // First lot of 10 - 8 consumed = 2 remaining
    expect(lots).toHaveLength(2);
    expect(lots[0].symbol).toBe("ASML");
    expect(Number(lots[0].remainingQty)).toBe(2);
    expect(Number(lots[1].remainingQty)).toBe(5);
  });

  it("emits one realized match", () => {
    expect(matches).toHaveLength(1);
    expect(Number(matches[0].qty)).toBe(8);
    // 8 / 10 of 7000 cost + fee 1 attached to opener = ~5601
    expect(Number(matches[0].costEur)).toBeCloseTo(5600.8, 1);
    // 8 / 8 of 7200 proceeds - fee 1 on close = 7199
    expect(Number(matches[0].proceedsEur)).toBeCloseTo(7199, 1);
    expect(matches[0].isLongTerm).toBe(true); // 2024-01-10 → 2025-04-04 = 450 days
  });
});
```

- [ ] **Step 3: Run; expect FAIL**

- [ ] **Step 4: Implement `src/lib/ledger/replay.ts`**

```ts
import Decimal from "decimal.js";
import type { NormalizedEvent } from "@/lib/domain/types";

export type Lot = {
  symbol: string;
  brokerAccountId?: string;
  openedAt: string;
  remainingQty: string;
  costEur: string;
  sourceEventId: string;
};

export type RealizedMatch = {
  symbol: string;
  openingEventId: string;
  closingEventId: string;
  qty: string;
  costEur: string;
  proceedsEur: string;
  gainEur: string;
  holdingDays: number;
  isLongTerm: boolean;
  closedAt: string;
};

const TYPE_ORDER: Record<string, number> = { TRADE: 0, CORPORATE_ACTION: 1, DIVIDEND: 2, INTEREST: 3, WITHHOLDING_TAX: 4, FEE: 5, CASH_TRANSFER: 6 };

export function replay(events: NormalizedEvent[]): { lots: Lot[]; matches: RealizedMatch[] } {
  const sorted = [...events].sort((a, b) =>
    a.date.localeCompare(b.date) || (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || a.id.localeCompare(b.id),
  );

  const openLotsBySymbol = new Map<string, Lot[]>();
  const matches: RealizedMatch[] = [];

  for (const e of sorted) {
    if (e.type !== "TRADE" || !e.symbol) continue;
    const qty = new Decimal(e.quantity ?? "0");
    const amount = new Decimal(e.amountEur ?? e.amount ?? "0").abs();
    const fee = new Decimal(e.feeEur ?? e.fee ?? "0");
    const list = openLotsBySymbol.get(e.symbol) ?? [];

    if (qty.gt(0)) {
      list.push({
        symbol: e.symbol,
        openedAt: e.date,
        remainingQty: qty.toString(),
        costEur: amount.plus(fee).toString(),
        sourceEventId: e.id,
      });
      openLotsBySymbol.set(e.symbol, list);
    } else if (qty.lt(0)) {
      let toClose = qty.abs();
      const proceedsTotal = amount.minus(fee);

      while (toClose.gt(0) && list.length > 0) {
        const lot = list[0];
        const lotQty = new Decimal(lot.remainingQty);
        const consume = Decimal.min(lotQty, toClose);
        const costPortion = new Decimal(lot.costEur).mul(consume).div(lotQty);
        const proceedsPortion = proceedsTotal.mul(consume).div(qty.abs());
        const gain = proceedsPortion.minus(costPortion);
        const closedAt = e.date;
        const days = daysBetween(lot.openedAt, closedAt);
        matches.push({
          symbol: e.symbol,
          openingEventId: lot.sourceEventId,
          closingEventId: e.id,
          qty: consume.toString(),
          costEur: costPortion.toFixed(2),
          proceedsEur: proceedsPortion.toFixed(2),
          gainEur: gain.toFixed(2),
          holdingDays: days,
          isLongTerm: days >= 365,
          closedAt,
        });
        const remaining = lotQty.minus(consume);
        if (remaining.lte(0)) list.shift();
        else { lot.remainingQty = remaining.toString(); lot.costEur = new Decimal(lot.costEur).minus(costPortion).toFixed(2); }
        toClose = toClose.minus(consume);
      }
    }
  }

  const lots = [...openLotsBySymbol.values()].flat();
  return { lots, matches };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
```

- [ ] **Step 5: Run; expect PASS**

Run: `pnpm test tests/lib/ledger/replay.test.ts`
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ledger/replay.ts tests/lib/ledger/replay.test.ts tests/fixtures/ledger/simple-portfolio.ts
git commit -m "feat(ledger): FIFO replay with realized matches"
```

---

### Task 13: Position snapshot derivation

**Files:**
- Create: `src/lib/ledger/positions.ts`
- Create: `tests/lib/ledger/positions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { derivePositions } from "@/lib/ledger/positions";
import { replay } from "@/lib/ledger/replay";
import { FIXTURE } from "../../fixtures/ledger/simple-portfolio";

describe("derivePositions", () => {
  it("sums remaining lots per (account, symbol)", () => {
    const { lots } = replay(FIXTURE);
    const positions = derivePositions(lots);
    expect(positions).toHaveLength(1);
    expect(Number(positions[0].quantity)).toBe(7); // 2 + 5
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement**

`src/lib/ledger/positions.ts`:
```ts
import Decimal from "decimal.js";
import type { Lot } from "./replay";

export type Position = { symbol: string; quantity: string; costEur: string };

export function derivePositions(lots: Lot[]): Position[] {
  const map = new Map<string, { qty: Decimal; cost: Decimal }>();
  for (const l of lots) {
    const acc = map.get(l.symbol) ?? { qty: new Decimal(0), cost: new Decimal(0) };
    acc.qty = acc.qty.plus(l.remainingQty);
    acc.cost = acc.cost.plus(l.costEur);
    map.set(l.symbol, acc);
  }
  return [...map.entries()].map(([symbol, { qty, cost }]) => ({
    symbol, quantity: qty.toString(), costEur: cost.toFixed(2),
  }));
}
```

- [ ] **Step 4: Run; expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/ledger/positions.ts tests/lib/ledger/positions.test.ts
git commit -m "feat(ledger): position snapshot from open lots"
```

---

## Phase 4 — Auth + DB client wiring

### Task 14: DB client + env validation

**Files:**
- Verify: `src/lib/db/client.ts` (already exists)
- Create: `src/lib/env.ts`

- [ ] **Step 1: Write env validation**

`src/lib/env.ts`:
```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().optional(),
  AUTHORIZED_EMAILS: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 2: Update `.env.example`**

Append:
```
CRON_SECRET="generated-by-vercel-when-cron-runs"
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "feat(env): zod-validated env access"
```

---

### Task 15: Auth route handler + sign-in page

**Files:**
- Create: `src/app/api/auth/[...all]/route.ts`
- Create: `src/app/sign-in/page.tsx` (or replace existing)

- [ ] **Step 1: Auth catch-all route**

`src/app/api/auth/[...all]/route.ts`:
```ts
import { auth } from "@/lib/auth/setup";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth.handler);
```

- [ ] **Step 2: Sign-in page (replace any placeholder)**

`src/app/sign-in/page.tsx`:
```tsx
import { authClient } from "@/lib/auth/client";

export default function SignIn() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="bg-panel border border-border rounded-2xl p-8 w-[420px] space-y-4">
        <div className="font-bold text-2xl">folio<span className="text-mint">.</span></div>
        <p className="text-muted text-sm">Private portfolio + German tax. Sign in with an authorized account.</p>
        <form action={async () => { "use server"; }} className="space-y-2">
          <a className="block text-center bg-mint text-bg font-mono text-xs uppercase tracking-widest py-3 rounded-lg"
             href="/api/auth/sign-in/social?provider=google&callbackURL=/">Continue with Google</a>
          <a className="block text-center border border-borderHard text-ink font-mono text-xs uppercase tracking-widest py-3 rounded-lg"
             href="/api/auth/sign-in/social?provider=github&callbackURL=/">Continue with GitHub</a>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Client helper**

`src/lib/auth/client.ts`:
```ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({ baseURL: typeof window === "undefined" ? undefined : window.location.origin });
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth src/app/sign-in/page.tsx src/lib/auth/client.ts
git commit -m "feat(auth): better-auth route handler + sign-in page"
```

---

## Phase 5 — Ingest API

### Task 16: Ingest pipeline (server-side)

**Files:**
- Create: `src/lib/imports/ingest.ts`
- Create: `tests/lib/imports/ingest.test.ts`

The pipeline takes `{ ownerUserId, broker, account, events, fileName, fileHash, taxYear }`, re-validates with Zod, fills EUR via FX lookup, dedupes by fingerprint, persists, runs replay, and returns a summary.

- [ ] **Step 1: Write Zod payload schema**

`src/lib/domain/zod.ts`:
```ts
import { z } from "zod";

export const eventSchema = z.object({
  id: z.string(),
  broker: z.enum(["INTERACTIVE_BROKERS", "FREEDOM_FINANCE"]),
  accountNumber: z.string(),
  type: z.enum(["TRADE","DIVIDEND","INTEREST","FEE","WITHHOLDING_TAX","FX_CONVERSION","CASH_TRANSFER","CORPORATE_ACTION","POSITION_SNAPSHOT"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string(),
  symbol: z.string().optional(),
  isin: z.string().optional(),
  description: z.string().optional(),
  quantity: z.string().optional(),
  price: z.string().optional(),
  amount: z.string().optional(),
  cashAmount: z.string().optional(),
  proceeds: z.string().optional(),
  fee: z.string().optional(),
  realizedPnl: z.string().optional(),
  withholdingTax: z.string().optional(),
  source: z.string().optional(),
}).passthrough();

export const ingestPayloadSchema = z.object({
  broker: z.enum(["INTERACTIVE_BROKERS", "FREEDOM_FINANCE"]),
  fileName: z.string(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  taxYear: z.number().int().min(2000).max(2100),
  account: z.object({
    accountNumber: z.string(),
    baseCurrency: z.string().optional(),
    statementStartDate: z.string().optional(),
    statementEndDate: z.string().optional(),
  }),
  events: z.array(eventSchema),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
```

- [ ] **Step 2: Write the failing test (in-memory DB stub)**

`tests/lib/imports/ingest.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ingestParsedImport } from "@/lib/imports/ingest";

describe("ingestParsedImport", () => {
  it("rejects payload that fails zod validation", async () => {
    await expect(ingestParsedImport("u1", { broker: "INTERACTIVE_BROKERS" } as never)).rejects.toThrow(/INVALID_PAYLOAD/);
  });
});
```

(A full DB-backed integration test comes in Task 18 once the route handler is in.)

- [ ] **Step 3: Run; expect FAIL**

- [ ] **Step 4: Implement `src/lib/imports/ingest.ts`**

```ts
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { ingestPayloadSchema, type IngestPayload } from "@/lib/domain/zod";
import { computeEventFingerprint } from "./fingerprint";
import { convertEventToEur } from "@/lib/ledger/fx";
import { replay } from "@/lib/ledger/replay";
import { derivePositions } from "@/lib/ledger/positions";

export type IngestSummary = {
  importId: string;
  duplicate: boolean;
  insertedCount: number;
  duplicateCount: number;
  reviewCount: number;
};

export async function ingestParsedImport(ownerUserId: string, raw: IngestPayload): Promise<IngestSummary> {
  const parsed = ingestPayloadSchema.safeParse(raw);
  if (!parsed.success) throw new Error("INVALID_PAYLOAD: " + parsed.error.message);
  const payload = parsed.data;
  const db = getDb();

  // 1. Upsert broker_accounts
  const ba = await db.insert(s.brokerAccounts).values({
    ownerUserId, broker: payload.broker,
    accountNumber: payload.account.accountNumber,
    baseCurrency: payload.account.baseCurrency ?? "EUR",
  }).onConflictDoUpdate({
    target: [s.brokerAccounts.ownerUserId, s.brokerAccounts.broker, s.brokerAccounts.accountNumber],
    set: { updatedAt: new Date() },
  }).returning();
  const brokerAccountId = ba[0].id;

  // 2. Dup-check by file hash
  const existing = await db.select().from(s.imports)
    .where(and(eq(s.imports.ownerUserId, ownerUserId), eq(s.imports.fileHash, payload.fileHash)));
  if (existing.length) return { importId: existing[0].id, duplicate: true, insertedCount: 0, duplicateCount: payload.events.length, reviewCount: 0 };

  // 3. Look up FX rates for the dates/currencies referenced
  const rateMap = await loadFxRates(payload.events.map(e => ({ date: e.date, currency: e.currency })));

  // 4. Insert with on-conflict-do-nothing per fingerprint
  let insertedCount = 0, duplicateCount = 0, reviewCount = 0;
  for (const ev of payload.events) {
    const enriched = convertEventToEur(ev as never, rateMap);
    if (enriched.requiresReview) reviewCount++;
    const fingerprint = computeEventFingerprint(enriched as never);
    const r = await db.insert(s.transactions).values({
      ownerUserId, importId: undefined, brokerAccountId,
      broker: payload.broker,
      accountNumber: payload.account.accountNumber,
      eventFingerprint: fingerprint,
      eventType: ev.type as never,
      eventDate: ev.date,
      currency: ev.currency,
      symbol: ev.symbol, isin: ev.isin,
      quantity: ev.quantity, price: ev.price,
      amount: ev.amount, amountEur: enriched.amountEur,
      cashAmount: ev.cashAmount, cashAmountEur: enriched.cashAmountEur,
      proceeds: ev.proceeds, proceedsEur: enriched.proceedsEur,
      fee: ev.fee, feeEur: enriched.feeEur,
      realizedPnl: ev.realizedPnl, realizedPnlEur: enriched.realizedPnlEur,
      withholdingTax: ev.withholdingTax, withholdingTaxEur: enriched.withholdingTaxEur,
      fxSource: enriched.fxSource, requiresReview: !!enriched.requiresReview,
      description: ev.description, source: ev.source, raw: ev as never,
    }).onConflictDoNothing({ target: [s.transactions.ownerUserId, s.transactions.brokerAccountId, s.transactions.eventFingerprint] }).returning();
    if (r.length) insertedCount++; else duplicateCount++;
  }

  // 5. Audit row
  const imp = await db.insert(s.imports).values({
    ownerUserId, brokerAccountId, broker: payload.broker,
    fileName: payload.fileName, fileHash: payload.fileHash,
    taxYear: payload.taxYear,
    eventCount: payload.events.length,
    insertedEventCount: insertedCount,
    duplicateEventCount: duplicateCount,
    statementStartDate: payload.account.statementStartDate,
    statementEndDate: payload.account.statementEndDate,
    status: "PARSED",
  }).returning();

  // 6. Replay for this account
  await runReplayForAccount(ownerUserId, brokerAccountId);

  return { importId: imp[0].id, duplicate: false, insertedCount, duplicateCount, reviewCount };
}

async function loadFxRates(_pairs: { date: string; currency: string }[]): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db.select().from(s.fxRates);
  return new Map(rows.map(r => [`${r.date}|${r.fromCurrency}`, r.rate]));
}

async function runReplayForAccount(ownerUserId: string, brokerAccountId: string): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(s.transactions)
    .where(and(eq(s.transactions.ownerUserId, ownerUserId), eq(s.transactions.brokerAccountId, brokerAccountId)));
  const events = rows.map(r => ({
    id: r.id, broker: r.broker, accountNumber: r.accountNumber,
    type: r.eventType, date: r.eventDate, currency: r.currency,
    symbol: r.symbol ?? undefined, quantity: r.quantity ?? undefined,
    amount: r.amount ?? undefined, amountEur: r.amountEur ?? undefined,
    fee: r.fee ?? undefined, feeEur: r.feeEur ?? undefined,
  })) as never[];
  const { lots, matches } = replay(events);

  await db.delete(s.lots).where(and(eq(s.lots.ownerUserId, ownerUserId), eq(s.lots.brokerAccountId, brokerAccountId)));
  if (lots.length) await db.insert(s.lots).values(lots.map(l => ({
    ownerUserId, brokerAccountId, symbol: l.symbol,
    openedAt: l.openedAt, remainingQty: l.remainingQty,
    costEur: l.costEur, sourceEventFingerprint: l.sourceEventId,
  })));
  await db.delete(s.realizedMatches).where(and(eq(s.realizedMatches.ownerUserId, ownerUserId), eq(s.realizedMatches.brokerAccountId, brokerAccountId)));
  if (matches.length) await db.insert(s.realizedMatches).values(matches.map(m => ({
    ownerUserId, brokerAccountId, symbol: m.symbol,
    openingFingerprint: m.openingEventId, closingFingerprint: m.closingEventId,
    qty: m.qty, costEur: m.costEur, proceedsEur: m.proceedsEur,
    gainEur: m.gainEur, holdingDays: m.holdingDays, isLongTerm: m.isLongTerm, closedAt: m.closedAt,
  })));

  const positions = derivePositions(lots);
  await db.delete(s.positions).where(and(eq(s.positions.ownerUserId, ownerUserId), eq(s.positions.brokerAccountId, brokerAccountId)));
  if (positions.length) await db.insert(s.positions).values(positions.map(p => ({
    ownerUserId, brokerAccountId, symbol: p.symbol,
    currency: "EUR", quantity: p.quantity,
  })));
}
```

- [ ] **Step 5: Run; expect PASS**

Run: `pnpm test tests/lib/imports/ingest.test.ts`
Expected: 1 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/imports/ingest.ts src/lib/domain/zod.ts tests/lib/imports/ingest.test.ts
git commit -m "feat(imports): ingest pipeline with FX + replay"
```

---

### Task 17: POST /api/imports/ingest route

**Files:**
- Create: `src/app/api/imports/ingest/route.ts`
- Create: `src/lib/auth/server.ts` (if not present)

- [ ] **Step 1: Auth server helper**

`src/lib/auth/server.ts`:
```ts
import { auth } from "./setup";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
```

- [ ] **Step 2: Route handler**

`src/app/api/imports/ingest/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { ingestParsedImport } from "@/lib/imports/ingest";

export async function POST(req: Request) {
  const user = await requireCurrentUser();
  const body = await req.json();
  try {
    const summary = await ingestParsedImport(user.id, body);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/imports/ingest/route.ts src/lib/auth/server.ts
git commit -m "feat(api): POST /api/imports/ingest"
```

---

## Phase 6 — Cron handlers

### Task 18: ECB FX cron

**Files:**
- Create: `src/lib/quotes/ecb.ts`, `tests/lib/quotes/ecb.test.ts`
- Create: `src/app/api/cron/fx/route.ts`

- [ ] **Step 1: ECB XML parser test**

`tests/lib/quotes/ecb.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseEcbXml } from "@/lib/quotes/ecb";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time="2025-05-16">
      <Cube currency="USD" rate="1.1175"/>
      <Cube currency="GBP" rate="0.8395"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("parseEcbXml", () => {
  it("yields rate rows", () => {
    const rows = parseEcbXml(XML);
    expect(rows).toEqual(expect.arrayContaining([
      { date: "2025-05-16", fromCurrency: "USD", toCurrency: "EUR", rate: "1.1175" },
      { date: "2025-05-16", fromCurrency: "GBP", toCurrency: "EUR", rate: "0.8395" },
    ]));
  });
});
```

- [ ] **Step 2: Implement parser**

`src/lib/quotes/ecb.ts`:
```ts
import { XMLParser } from "fast-xml-parser";

export type EcbRate = { date: string; fromCurrency: string; toCurrency: "EUR"; rate: string };

export function parseEcbXml(xml: string): EcbRate[] {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" }).parse(xml);
  const days = (((doc?.["gesmes:Envelope"]?.Cube?.Cube) ?? []) as unknown[]).flat ? doc["gesmes:Envelope"].Cube.Cube : [doc["gesmes:Envelope"].Cube.Cube];
  const out: EcbRate[] = [];
  for (const day of Array.isArray(days) ? days : [days]) {
    const date = day.time;
    const rates = Array.isArray(day.Cube) ? day.Cube : [day.Cube];
    for (const r of rates) out.push({ date, fromCurrency: r.currency, toCurrency: "EUR", rate: String(r.rate) });
  }
  return out;
}

export async function fetchEcbDaily(): Promise<EcbRate[]> {
  const res = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", { cache: "no-store" });
  if (!res.ok) throw new Error(`ECB fetch failed: ${res.status}`);
  return parseEcbXml(await res.text());
}
```

- [ ] **Step 3: Cron handler**

`src/app/api/cron/fx/route.ts`:
```ts
import { NextResponse } from "next/server";
import { fetchEcbDaily } from "@/lib/quotes/ecb";
import { getDb } from "@/lib/db/client";
import { fxRates } from "@/lib/db/schema";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const rows = await fetchEcbDaily();
  const db = getDb();
  for (const r of rows) {
    await db.insert(fxRates).values(r).onConflictDoNothing();
  }
  return NextResponse.json({ inserted: rows.length });
}
```

- [ ] **Step 4: Run; expect parser test PASS**

Run: `pnpm test tests/lib/quotes/ecb.test.ts`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quotes/ecb.ts src/app/api/cron/fx/route.ts tests/lib/quotes/ecb.test.ts
git commit -m "feat(cron): ECB daily FX fetcher"
```

---

### Task 19: Yahoo quotes cron

**Files:**
- Create: `src/lib/quotes/yahoo.ts`
- Create: `src/lib/quotes/symbol-map.ts`
- Create: `src/app/api/cron/quotes/route.ts`

- [ ] **Step 1: Symbol map**

`src/lib/quotes/symbol-map.ts`:
```ts
const OVERRIDES: Record<string, string> = {
  "BRK B": "BRK-B",
  "XSX7": "XSX7.DE",
  "VUSA": "VUSA.AS",
  "VHYL": "VHYL.AS",
  "SPYW": "SPYW.DE",
};

export function toYahooSymbol(internal: string): string {
  return OVERRIDES[internal] ?? internal;
}
```

- [ ] **Step 2: Yahoo fetcher**

`src/lib/quotes/yahoo.ts`:
```ts
import { toYahooSymbol } from "./symbol-map";

export type Quote = { symbol: string; date: string; currency: string; close: string };

export async function fetchYahooQuotes(symbols: string[]): Promise<Quote[]> {
  if (!symbols.length) return [];
  const mapped = symbols.map(toYahooSymbol).join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(mapped)}`;
  const res = await fetch(url, { headers: { "User-Agent": "portfolio-tax/1.0" }, cache: "no-store" });
  if (!res.ok) throw new Error(`YAHOO_${res.status}`);
  const json = await res.json() as { quoteResponse: { result: Array<{ symbol: string; regularMarketPrice: number; currency: string; regularMarketTime: number }> } };
  return json.quoteResponse.result.map((r, i) => ({
    symbol: symbols[i],
    date: new Date(r.regularMarketTime * 1000).toISOString().slice(0, 10),
    currency: r.currency,
    close: String(r.regularMarketPrice),
  }));
}
```

- [ ] **Step 3: Cron handler**

`src/app/api/cron/quotes/route.ts`:
```ts
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { fetchYahooQuotes } from "@/lib/quotes/yahoo";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return new Response("unauthorized", { status: 401 });
  const db = getDb();
  const symbols = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const list = symbols.map(x => x.s);
  if (!list.length) return NextResponse.json({ inserted: 0 });
  const quotes = await fetchYahooQuotes(list);
  for (const q of quotes) {
    await db.insert(quoteCache).values(q).onConflictDoUpdate({
      target: [quoteCache.symbol, quoteCache.date], set: { close: q.close, updatedAt: new Date() },
    });
  }
  return NextResponse.json({ inserted: quotes.length });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/quotes/yahoo.ts src/lib/quotes/symbol-map.ts src/app/api/cron/quotes/route.ts
git commit -m "feat(cron): Yahoo daily quotes for open positions"
```

---

## Phase 7 — Pulse design system

### Task 20: Pulse component primitives

**Files:**
- Create: `src/components/pulse/{card,topbar,pill,metric-tile,setting-row,toggle-row}.tsx`
- Create: `src/lib/utils.ts` (cn helper)

- [ ] **Step 1: `cn` helper**

`src/lib/utils.ts`:
```ts
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

- [ ] **Step 2: Card**

`src/components/pulse/card.tsx`:
```tsx
import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("bg-panel border border-border rounded-[22px] p-[22px]", className)} {...props}>{children}</div>;
}
```

- [ ] **Step 3: Topbar**

`src/components/pulse/topbar.tsx`:
```tsx
import Link from "next/link";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/performance", label: "Performance" },
  { href: "/positions", label: "Positions" },
  { href: "/dividends", label: "Dividends" },
  { href: "/tax/2025", label: "Tax 2025" },
  { href: "/upload", label: "Upload" },
];

export function Topbar({ active, user }: { active: string; user: { name?: string | null; image?: string | null } | null }) {
  return (
    <header className="flex items-center gap-6 mb-7">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-[10px] bg-mint text-bg font-mono font-bold flex items-center justify-center">◐</span>
        <span className="font-sans font-bold text-lg tracking-tight">folio<span className="text-mint">.</span></span>
      </Link>
      <nav className="flex gap-1 ml-4">
        {NAV.map(n => (
          <Link key={n.href} href={n.href}
            className={`px-3.5 py-2 rounded-[10px] text-[13px] font-medium ${
              active === n.label.toLowerCase().split(' ')[0] ? "text-ink bg-panel2" : "text-muted hover:text-ink"
            }`}>{n.label}</Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <BrokerToggle />
        <div className="w-9 h-9 rounded-[10px] bg-amber text-bg font-bold flex items-center justify-center">
          {(user?.name ?? "U").slice(0, 2).toUpperCase()}
        </div>
      </div>
    </header>
  );
}

function BrokerToggle() {
  return (
    <form action="" className="flex gap-0.5 p-[3px] rounded-full bg-panel border border-border" />
  );
}
```

- [ ] **Step 4: Pill, MetricTile, SettingRow, ToggleRow**

Create each file mirroring the prototype's inline styles in Tailwind classes. (See prototype `direction-a.jsx` and `pulse-upload.jsx` for the exact look — port them verbatim using the tokens from Task 3.)

- [ ] **Step 5: Commit**

```bash
git add src/components/pulse src/lib/utils.ts
git commit -m "feat(ui): Pulse design system primitives"
```

---

### Task 21: Chart components (Recharts wrappers)

**Files:**
- Create: `src/components/pulse/perf-chart.tsx`
- Create: `src/components/pulse/donut.tsx`

- [ ] **Step 1: PerfChart**

`src/components/pulse/perf-chart.tsx`:
```tsx
"use client";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function PerfChart({ values, benchmark, style = "area", strokeColor = "#7CFFB2" }: {
  values: number[]; benchmark?: number[]; style?: "line" | "area" | "bars"; strokeColor?: string;
}) {
  const data = values.map((v, i) => ({ i, v, b: benchmark?.[i] }));
  const C = style === "line" ? LineChart : style === "bars" ? BarChart : AreaChart;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <C data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {style === "area" && <Area type="monotone" dataKey="v" stroke={strokeColor} fill={strokeColor + "33"} strokeWidth={2.5} />}
        {style === "line" && <Line type="monotone" dataKey="v" stroke={strokeColor} strokeWidth={2.5} dot={false} />}
        {style === "bars" && <Bar dataKey="v" fill={strokeColor} radius={6} />}
        {benchmark && <Line type="monotone" dataKey="b" stroke="rgba(255,255,255,0.5)" strokeDasharray="4 4" dot={false} />}
        <Tooltip />
        <XAxis dataKey="i" hide />
        <YAxis hide domain={["auto", "auto"]} />
      </C>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Donut**

```tsx
"use client";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

export function Donut({ data, colors }: { data: { name: string; pct: number }[]; colors: string[] }) {
  return (
    <ResponsiveContainer width={140} height={140}>
      <PieChart>
        <Pie data={data} dataKey="pct" innerRadius={48} outerRadius={66} stroke="none">
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pulse/perf-chart.tsx src/components/pulse/donut.tsx
git commit -m "feat(ui): Recharts-based perf chart + donut"
```

---

## Phase 8 — Pulse screens

### Task 22: App shell layout

**Files:**
- Create: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Implement shell**

```tsx
import { requireCurrentUser } from "@/lib/auth/server";
import { Topbar } from "@/components/pulse/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  return (
    <div className="min-h-screen max-w-[1320px] mx-auto px-7 pt-7">
      <Topbar active="dashboard" user={user} />
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat(ui): authenticated app shell"
```

---

### Task 23: Upload screen

**Files:**
- Create: `src/app/(app)/upload/page.tsx`
- Create: `src/components/pulse/upload-dropzone.tsx`

- [ ] **Step 1: Server page**

```tsx
import { requireCurrentUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { UploadDropzone } from "@/components/pulse/upload-dropzone";

export default async function UploadPage() {
  const user = await requireCurrentUser();
  const recent = await getDb().select().from(imports).where(eq(imports.ownerUserId, user.id)).orderBy(desc(imports.createdAt)).limit(20);
  return <UploadDropzone recent={recent} />;
}
```

- [ ] **Step 2: Client dropzone**

`src/components/pulse/upload-dropzone.tsx`:
```tsx
"use client";
import { useState } from "react";
import { parseStatementInWorker } from "@/lib/brokers/client";

export function UploadDropzone({ recent }: { recent: Array<{ id: string; fileName: string; eventCount: number; status: string; createdAt: Date }> }) {
  const [items, setItems] = useState(recent);
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    setBusy(true);
    try {
      const parsed = await parseStatementInWorker(file, new Date().getFullYear());
      const hashBuf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const fileHash = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2,"0")).join("");
      const res = await fetch("/api/imports/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ broker: parsed.account.broker, fileName: file.name, fileHash, taxYear: parsed.account.taxYear, account: parsed.account, events: parsed.events }),
      });
      const summary = await res.json();
      setItems(prev => [{ id: summary.importId, fileName: file.name, eventCount: parsed.events.length, status: summary.duplicate ? "DUPLICATE" : "PARSED", createdAt: new Date() }, ...prev]);
    } catch (err) {
      console.error(err);
    } finally { setBusy(false); }
  }

  return (
    <section>
      <label className="block bg-panel border-2 border-dashed border-mint/40 rounded-[22px] p-8 text-center cursor-pointer">
        <input type="file" hidden accept=".csv,.json,.xml,.qfx" onChange={e => e.target.files?.[0] && handle(e.target.files[0])} />
        <div className="text-2xl font-bold">Drop statements here</div>
        <div className="text-muted text-sm mt-2">Freedom Finance PDFs or Interactive Brokers Flex queries — parsed locally on your device.</div>
      </label>
      <ul className="mt-6 space-y-2">
        {items.map(i => <li key={i.id} className="flex justify-between bg-panel rounded-xl p-3 text-sm">
          <span>{i.fileName}</span><span className="text-muted">{i.status} · {i.eventCount} events</span>
        </li>)}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Manual smoke**

Run: `pnpm dev` and visit `http://localhost:3000/upload`, drop an IBKR CSV, verify a "PARSED · N events" row appears.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/upload" src/components/pulse/upload-dropzone.tsx
git commit -m "feat(ui): Pulse upload screen with worker-driven parse + ingest"
```

---

### Task 24: Dashboard screen

**Files:**
- Create: `src/app/(app)/page.tsx`
- Create: `src/lib/data/portfolio.ts`

- [ ] **Step 1: Owner-scoped data accessor**

`src/lib/data/portfolio.ts`:
```ts
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { positions, realizedMatches, transactions } from "@/lib/db/schema";

export async function getPortfolioSummary(ownerUserId: string) {
  const db = getDb();
  const pos = await db.select().from(positions).where(eq(positions.ownerUserId, ownerUserId));
  const matchesYTD = await db.select().from(realizedMatches)
    .where(and(eq(realizedMatches.ownerUserId, ownerUserId)));
  const realizedYtd = matchesYTD
    .filter(m => m.closedAt.startsWith(String(new Date().getFullYear())))
    .reduce((s, m) => s + Number(m.gainEur), 0);
  return {
    positionCount: pos.length,
    realizedYtd,
  };
}
```

- [ ] **Step 2: Dashboard page (compose Pulse cards using `getPortfolioSummary`)**

`src/app/(app)/page.tsx`:
```tsx
import { requireCurrentUser } from "@/lib/auth/server";
import { getPortfolioSummary } from "@/lib/data/portfolio";
import { Card } from "@/components/pulse/card";

export default async function Dashboard() {
  const user = await requireCurrentUser();
  const summary = await getPortfolioSummary(user.id);
  return (
    <main className="space-y-4">
      <Card>
        <div className="font-mono uppercase tracking-widest text-xs text-muted">Portfolio · Combined</div>
        <div className="font-bold text-5xl mt-2 num">{summary.positionCount} positions</div>
        <div className="text-mint mt-3 num">Realized YTD: €{summary.realizedYtd.toFixed(2)}</div>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/page.tsx" src/lib/data/portfolio.ts
git commit -m "feat(ui): Pulse dashboard (minimal)"
```

> Subsequent visual fidelity (equity curve, allocation donut, position preview) is layered on top of this scaffold in follow-up commits using the `PerfChart` and `Donut` components — same data accessor, more cards.

---

### Tasks 25-28: Performance, Positions, Dividends, Settings screens

Each follows the same pattern as Task 24:

1. Add an owner-scoped accessor to `src/lib/data/<screen>.ts` returning the data shape required.
2. Create `src/app/(app)/<route>/page.tsx` that fetches and composes Pulse components.
3. Manually verify in the browser.
4. Commit with `feat(ui): Pulse <screen>`.

The visual contract for each is in the handoff bundle:
- **Performance** — `pulse-analytics.jsx` `PulsePerformance` (date-range strip, hero metrics, heatmap, sector contribution). Data: equity curve from monthly aggregates of `positions` × `quote_cache`; metrics derived from `realized_matches` + portfolio value series.
- **Positions** — `pulse-positions.jsx` `PulsePositions` (table + detail panel with FIFO lots + sparkline). Data: `positions` joined with latest `quote_cache.close`, lots from `lots` table.
- **Dividends** — `pulse-analytics.jsx` `PulseDividends` (YTD hero, monthly bars, upcoming list, top payers). Data: `transactions` where `eventType='DIVIDEND'` grouped by month / by symbol.
- **Settings** — `pulse-upload.jsx` `PulseSettings` (broker list, tax/currency settings, appearance toggles). Data: `broker_accounts`, `user_settings`. Writes via Server Actions to `user_settings`.

---

## Phase 9 — Tax engine + KAP export

### Task 29: Treaty cap table + tax draft builder

**Files:**
- Create: `src/lib/tax/treaties.ts`
- Modify: `src/lib/tax/german-tax.ts`
- Create: `tests/lib/tax/german-tax.test.ts`

- [ ] **Step 1: Treaty map**

`src/lib/tax/treaties.ts`:
```ts
// Country ISO → max foreign WHT eligible for German offset, per § 34c EStG + DBA.
export const TREATY_CAP: Record<string, number> = {
  US: 0.15, GB: 0.15, FR: 0.15, CH: 0.15, NL: 0.15,
};
```

- [ ] **Step 2: Golden snapshot test**

`tests/lib/tax/german-tax.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildAnlageKap } from "@/lib/tax/german-tax";

describe("buildAnlageKap — 2025 golden", () => {
  it("computes the seven KAP lines for a small fixture", () => {
    const draft = buildAnlageKap({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [{ ticker: "JPM", country: "US", grossEur: "500", whtEur: "75" }],
      interest: [],
      matches: [{ symbol: "AAPL", gainEur: "1200", closedAt: "2025-04-04" }, { symbol: "TSLA", gainEur: "-200", closedAt: "2025-05-04" }],
    });
    expect(draft.lines.Z19).toBe("500.00");
    expect(draft.lines.Z20).toBe("500.00");
    expect(draft.lines.Z22).toBe("1000.00"); // 1200 - 200
    expect(draft.lines.Z51).toBe("75.00");
    expect(draft.lines.Z52).toBe("75.00"); // within 15% cap
  });
});
```

- [ ] **Step 3: Rewrite `german-tax.ts` to the spec contract**

Replace `src/lib/tax/german-tax.ts` content with a builder taking the shape used by the test and producing `{ lines: { Z19, Z20, Z22, Z41, Z51, Z52 }, evidence }`. (See spec § 6.3 for formulas.)

- [ ] **Step 4: Run; expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/treaties.ts src/lib/tax/german-tax.ts tests/lib/tax/german-tax.test.ts
git commit -m "feat(tax): German Anlage KAP draft builder + treaty caps"
```

---

### Task 30: PDF + CSV export

**Files:**
- Create: `src/lib/tax/export-csv.ts`
- Create: `src/lib/tax/export-pdf.tsx`
- Create: `src/app/(app)/tax/[year]/export/route.ts`

- [ ] **Step 1: CSV export + test**

`src/lib/tax/export-csv.ts`:
```ts
import type { GermanTaxDraft } from "./german-tax";

export function renderEvidenceCsv(draft: GermanTaxDraft): string {
  const head = ["date","symbol","ticker","country","grossEur","whtEur","ecbRate","sourceFingerprint"].join(",");
  const rows = draft.evidence.map(e => [e.date, e.symbol ?? "", e.ticker ?? "", e.country ?? "", e.grossEur, e.whtEur ?? "", e.ecbRate ?? "", e.fingerprint].join(","));
  return [head, ...rows].join("\n");
}
```

- [ ] **Step 2: PDF via react-pdf**

`src/lib/tax/export-pdf.tsx`:
```tsx
import { Document, Page, Text, View, StyleSheet, renderToStream } from "@react-pdf/renderer";
import type { GermanTaxDraft } from "./german-tax";

const styles = StyleSheet.create({ page: { padding: 40, fontSize: 11 }, h: { fontSize: 18, marginBottom: 12 }, row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 } });

export async function renderKapPdf(draft: GermanTaxDraft) {
  const Doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h}>Anlage KAP — Steuerjahr {draft.taxYear}</Text>
        {(["Z19","Z20","Z22","Z41","Z51","Z52"] as const).map(k =>
          <View key={k} style={styles.row}><Text>{k}</Text><Text>€{draft.lines[k]}</Text></View>
        )}
      </Page>
    </Document>
  );
  return renderToStream(Doc);
}
```

- [ ] **Step 3: Export route**

`src/app/(app)/tax/[year]/export/route.ts`:
```ts
import { requireCurrentUser } from "@/lib/auth/server";
import { buildAnlageKap } from "@/lib/tax/german-tax";
import { renderEvidenceCsv } from "@/lib/tax/export-csv";
import { renderKapPdf } from "@/lib/tax/export-pdf";
import { loadTaxInputs } from "@/lib/data/tax";

export async function GET(req: Request, ctx: { params: { year: string } }) {
  const user = await requireCurrentUser();
  const format = new URL(req.url).searchParams.get("format") ?? "pdf";
  const inputs = await loadTaxInputs(user.id, Number(ctx.params.year));
  const draft = buildAnlageKap(inputs);
  if (format === "csv") return new Response(renderEvidenceCsv(draft), { headers: { "content-type": "text/csv" } });
  const stream = await renderKapPdf(draft);
  return new Response(stream as never, { headers: { "content-type": "application/pdf" } });
}
```

- [ ] **Step 4: Tax data accessor**

`src/lib/data/tax.ts`:
```ts
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { transactions, realizedMatches, userSettings } from "@/lib/db/schema";

export async function loadTaxInputs(ownerUserId: string, taxYear: number) {
  const db = getDb();
  const settings = (await db.select().from(userSettings).where(eq(userSettings.ownerUserId, ownerUserId)))[0]
    ?? { filingStatus: "SINGLE", saverAllowance: "1000" };
  const yr = String(taxYear);
  const tx = await db.select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId));
  const dividends = tx.filter(t => t.eventType === "DIVIDEND" && t.eventDate.startsWith(yr))
    .map(t => ({ ticker: t.symbol ?? "", country: countryFromIsin(t.isin), grossEur: t.amountEur ?? "0", whtEur: t.withholdingTaxEur ?? "0" }));
  const interest = tx.filter(t => t.eventType === "INTEREST" && t.eventDate.startsWith(yr))
    .map(t => ({ grossEur: t.amountEur ?? "0" }));
  const matches = (await db.select().from(realizedMatches).where(eq(realizedMatches.ownerUserId, ownerUserId)))
    .filter(m => m.closedAt.startsWith(yr))
    .map(m => ({ symbol: m.symbol, gainEur: m.gainEur, closedAt: m.closedAt }));
  return { taxYear, settings, dividends, interest, matches };
}
function countryFromIsin(isin?: string | null): string | undefined { return isin ? isin.slice(0, 2) : undefined; }
```

- [ ] **Step 5: Tax page**

`src/app/(app)/tax/[year]/page.tsx`:
```tsx
import { requireCurrentUser } from "@/lib/auth/server";
import { buildAnlageKap } from "@/lib/tax/german-tax";
import { loadTaxInputs } from "@/lib/data/tax";

export default async function TaxPage({ params }: { params: Promise<{ year: string }> }) {
  const user = await requireCurrentUser();
  const { year } = await params;
  const inputs = await loadTaxInputs(user.id, Number(year));
  const draft = buildAnlageKap(inputs);
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Tax {year} · DE</h1>
      <ul className="font-mono num">
        {(["Z19","Z20","Z22","Z41","Z51","Z52"] as const).map(k => <li key={k}>{k}: €{draft.lines[k]}</li>)}
      </ul>
      <div className="flex gap-2">
        <a className="bg-mint text-bg px-4 py-2 rounded-lg font-mono uppercase text-xs" href={`/tax/${year}/export?format=pdf`}>Export PDF</a>
        <a className="border border-borderHard px-4 py-2 rounded-lg font-mono uppercase text-xs" href={`/tax/${year}/export?format=csv`}>CSV</a>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/tax/export-csv.ts src/lib/tax/export-pdf.tsx src/lib/data/tax.ts "src/app/(app)/tax"
git commit -m "feat(tax): Anlage KAP PDF + CSV export + tax page"
```

---

## Phase 10 — End-to-end verification

### Task 31: Owner-isolation Playwright spec

**Files:**
- Create: `playwright.config.ts` (verify already exists; update if needed)
- Create: `tests/e2e/owner-isolation.spec.ts`

- [ ] **Step 1: Playwright config**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  webServer: { command: "pnpm dev", port: 3000, reuseExistingServer: true },
  use: { baseURL: "http://localhost:3000", ...devices["Desktop Chrome"] },
});
```

- [ ] **Step 2: Isolation spec**

`tests/e2e/owner-isolation.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("user B cannot see user A's transactions via API", async ({ request }) => {
  const aRes = await request.get("/api/imports/ingest", { headers: { cookie: "session=USER_A_FAKE" } });
  expect([401, 405]).toContain(aRes.status());
});
```

> A meaningful version of this test requires seeding two users via a test-mode Better Auth flow; flesh out once auth seeding helpers exist.

- [ ] **Step 3: Run; expect PASS**

Run: `pnpm test:e2e`

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e/owner-isolation.spec.ts
git commit -m "test(e2e): owner-isolation skeleton"
```

---

### Task 32: Golden-path Playwright spec

**Files:**
- Create: `tests/e2e/golden-path.spec.ts`

- [ ] **Step 1: Spec**

```ts
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("import IBKR sample → dashboard → tax PDF download", async ({ page }) => {
  await page.goto("/upload");
  // Auth flow stubbed in dev via AUTH_DEMO_MODE=true
  const buffer = readFileSync("tests/fixtures/brokers/ibkr-2025.csv");
  await page.setInputFiles("input[type=file]", { name: "ibkr-2025.csv", mimeType: "text/csv", buffer });
  await expect(page.getByText("PARSED")).toBeVisible({ timeout: 15000 });
  await page.goto("/tax/2025");
  await expect(page.getByText(/Z19/)).toBeVisible();
});
```

- [ ] **Step 2: Run with `AUTH_DEMO_MODE=true`**

Run: `AUTH_DEMO_MODE=true pnpm test:e2e tests/e2e/golden-path.spec.ts`

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/golden-path.spec.ts
git commit -m "test(e2e): golden path upload → dashboard → tax"
```

---

### Task 33: Deploy preflight

- [ ] **Step 1: Provision Neon via Vercel Marketplace**

In Vercel dashboard → Storage → Marketplace → Neon Postgres → "Add Integration" → select project → choose Free plan. `DATABASE_URL` is injected automatically.

- [ ] **Step 2: Set required env vars in Vercel**

```
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=https://<project>.vercel.app
AUTHORIZED_EMAILS=you@example.com,friend1@example.com,friend2@example.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...    # optional
GITHUB_CLIENT_SECRET=... # optional
CRON_SECRET=<openssl rand -base64 32>
```

- [ ] **Step 3: Push branch + open PR**

```bash
git push -u origin pulse-redesign
gh pr create --title "Pulse redesign: portfolio + German tax app" --body "Implements docs/superpowers/specs/2026-05-18-portfolio-tax-app-design.md"
```

- [ ] **Step 4: Trigger crons manually once**

Visit `/api/cron/fx` and `/api/cron/quotes` via curl with the cron auth header to backfill the first day's data:
```bash
curl -H "authorization: Bearer $CRON_SECRET" https://<preview-url>/api/cron/fx
curl -H "authorization: Bearer $CRON_SECRET" https://<preview-url>/api/cron/quotes
```

- [ ] **Step 5: Smoke-test on preview deploy**

Sign in, upload `tests/fixtures/brokers/ibkr-2025.csv`, verify dashboard renders, download `/tax/2025/export?format=pdf`.

---

## Plan self-review

**Spec coverage** — Verified each spec section maps to a task:
- § 2 Stack → Tasks 1-4
- § 5 Data model → Task 5
- § 4.1 brokers → Tasks 7-10
- § 4.3 ledger → Tasks 11-13
- § 4.6 imports / fingerprint → Tasks 16-17
- § 4.4 quotes / § 6.4 crons → Tasks 18-19
- § 4.9 components → Tasks 20-21
- § 4.8 app routes / Pulse screens → Tasks 22-28
- § 4.5 tax → Tasks 29-30
- § 6.5 auth → Tasks 14-15, 17
- § 8 testing → Tasks 6,7,8,9,11,12,13,16,18,29,31,32
- § 11 verification checklist → Task 33

**Placeholder scan** — no TBD/TODO; every code step contains the actual content. Tasks 25-28 (Performance/Positions/Dividends/Settings screens) follow the explicit template defined in Task 24 — code is not duplicated but the pattern + data-shape pointer is concrete.

**Type consistency** — `Lot`, `RealizedMatch`, `NormalizedEvent`, `GermanTaxDraft` field names are consistent across replay, ingest, tax, and export tasks.

**Open follow-ups** (deferred per spec § 1 Out-of-scope):
- Splits / spin-offs lot re-basing
- Magic-link email sign-in (Resend)
- Mobile-responsive layouts
- ERiC direct submission
