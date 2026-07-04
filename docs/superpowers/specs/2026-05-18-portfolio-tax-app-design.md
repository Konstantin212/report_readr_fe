# Portfolio & Tax — Design Spec

**Date:** 2026-05-18
**Status:** Draft for review
**Author:** Solution architecture pass (Claude, brainstorming session)

## 1. Context and intent

A small, multi-user web app that ingests broker statements from **Freedom Finance** (JSON) and **Interactive Brokers** (Activity Statement CSV), normalizes them into one event-sourced ledger, surfaces portfolio analytics, and produces a **German Anlage KAP** draft (PDF + CSV) that the user copies into ELSTER's web form. To be hosted on **Vercel Hobby (free tier)**, used by ~3–5 friends with sign-in, retaining no broker files — only the extracted normalized events.

UI direction is **Pulse** (Direction A from the design handoff bundle in `C:\Users\<user>\Downloads\test-handoff.zip`): seven screens — Upload, Dashboard, Performance, Positions, Dividends, Tax report, Settings. Dark `#0b0d10` background, neon mint/amber/magenta accents, Geist + Geist Mono typography, 1320 px fixed-width canvas.

Sample data verified in-session:
- IBKR Activity CSVs at `C:\Users\<user>\Downloads\ibkr reports\U00000000_{2023,2024,2025}_*.csv` — multi-section CSV (Statement, Account Info, Trades, Dividends, Interest, Cash Report, Deposits & Withdrawals, Corporate Actions, Mark-to-Market, Realized & Unrealized).
- Freedom Finance JSON at `C:\Users\<user>\Downloads\900000_..._all.json` — 850 KB with keys `trades.detailed`, `cash_flows.detailed`, `commissions.detailed`, `corporate_actions.detailed`, plus account/period metadata.

### Captured user decisions
- **ELSTER scope:** PDF + CSV draft for manual entry. No ERiC integration.
- **Quote source:** Yahoo Finance unofficial (`query1.finance.yahoo.com/v7/finance/quote`) on a daily cron, layered on top of broker statement closes.
- **File handling:** Parse in the browser, send only normalized events to the server. No object storage.
- **Approach:** Fresh UI/route design — the seven Pulse screens replace the placeholder pages on the current branch. Domain code that is already correct against real broker samples (parsers, fingerprint, German tax stub, auth allowlist) is reused; layout, routes, and component library are rebuilt. The stack stays in the same family because the constraint (Vercel free tier + multi-user + tax-grade math) selects it.

### Out of scope (v1)
- Mobile-responsive layouts (desktop only; horizontal scroll on phones).
- Real-time / intraday quotes.
- ERiC / direct ELSTER submission.
- Re-basing FIFO lots after splits/spin-offs (corporate actions surface in a review queue, not auto-applied).
- Email/password sign-in (OAuth + allowlist only).

## 2. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 15 App Router** | Server Components + Route Handlers in one deploy; native Vercel target |
| Runtime | **Fluid Compute (Node 24 LTS)** | Default on Vercel; warm-instance reuse cuts cold starts; no Edge restrictions |
| Hosting | **Vercel Hobby** | Free; supports two daily crons; 300 s function timeout default |
| Project config | **`vercel.ts`** | Replaces `vercel.json` per current Vercel guidance — typed config, cron definitions live there |
| Database | **Neon Postgres via Vercel Marketplace** | 0.5 GB free, HTTP driver (no pooler needed for Fluid Compute), branches per deploy |
| ORM | **Drizzle** | SQL-honest migrations, lightweight, edge/serverless-friendly |
| Auth | **Better Auth** | Google + GitHub OAuth; email allowlist via `AUTHORIZED_EMAILS` env |
| UI | **Tailwind v3 + shadcn/ui + Recharts** | Tailwind tokens encode the Pulse palette; Recharts replaces the prototype's hand-rolled SVG |
| Fonts | **next/font/google** (Geist + Geist Mono) | Self-hosted, no extra request, FOIT-free |
| Validation | **Zod** | Shared client/server schemas for `NormalizedEvent` and import payloads |
| Decimal math | **decimal.js** | Avoids float drift on cost basis, FX, tax base |
| PDF | **@react-pdf/renderer** | Pure-JS server-rendered PDF for KAP export |
| Tests | **Vitest** (unit) + **Playwright** (e2e) | Vitest for parsers/ledger/tax; Playwright for golden-path UI |

External services (all free):
- **ECB** daily reference rates (`eurofxref-daily.xml`) — fed by Vercel cron.
- **Yahoo Finance** unofficial JSON — fed by Vercel cron; if it breaks, position prices fall back to the latest broker statement close.

## 3. System architecture

```
Browser                                    Vercel Fluid Compute (Node 24)
─────────────                              ────────────────────────────────
Upload page
  Drop file ─► Web Worker parses          POST  /api/imports/ingest
   (IBKR CSV / FF JSON)  ──── events ─►     • requireCurrentUser()
                                            • upsert broker_accounts
                                            • dedupe by fileHash & fingerprint
                                            • fill EUR via fx_rates lookup
                                            • replayLedger() → lots, matches
                                            • return ImportSummary

Server Components (Dashboard / Perf /     ◄─── Drizzle queries ────────────
Positions / Dividends / Tax / Settings)        Neon Postgres
  Render HTML via owner-scoped queries
                                            Daily crons (vercel.ts)
                                              /api/cron/fx     15:30 UTC, Mon–Fri
                                              /api/cron/quotes 21:00 UTC, Mon–Fri
```

The design has **two trust boundaries**:
1. **Browser → server**: parser runs client-side; the server treats incoming events as *untrusted* and re-validates with Zod, recomputes fingerprints, and re-derives EUR values from the canonical `fx_rates` table.
2. **Owner isolation**: every data-access function takes `ownerUserId` as its first argument; a single helper `withOwnerScope(userId, query)` enforces this in `src/lib/data/*`. Cross-owner reads are impossible at the query layer.

## 4. Modules

Each module has one clear purpose, a small public surface, and an internal-only implementation that callers don't need to read. The split mirrors how the data flows: parse → normalize → persist → replay → analyze → render.

### 4.1 `lib/brokers` — parsing (client-side, Node-safe)
- `index.ts` — `parseBrokerStatement(input): ParsedBrokerStatement` dispatcher
- `ibkr.ts` — IBKR Activity Statement CSV parser
- `freedom.ts` — Freedom Finance JSON parser
- `detect.ts` — sniffs broker from filename/MIME + first-bytes; never throws (returns `unknown`)
- `worker.ts` — Web Worker entry that wraps `parseBrokerStatement` so the UI thread stays responsive
- `format.ts`, `csv.ts` — number/date/CSV utilities

**Public types**: `ParsedBrokerStatement = { account: BrokerAccountMetadata, events: NormalizedEvent[] }`, `BrokerAccountMetadata`, `NormalizedEvent`. **Hidden**: section parsers, CSV state machine.

Reuse: the WIP at `src/lib/brokers/{ibkr,freedom}.ts` already parses both formats correctly against the real sample files. Lift this code unchanged; only the host (Web Worker) is new.

### 4.2 `lib/domain` — vocabulary
- `types.ts` — `Broker`, `EventType`, `NormalizedEvent`, `FxSource`
- `decimal.ts` — Decimal wrapper (re-exports decimal.js with named utility functions)
- `zod.ts` — Zod schemas for `NormalizedEvent` and the ingest payload

### 4.3 `lib/ledger` — replay
- `replay.ts` — `replay(events, openLots = []): { lots, matches, positions }`
  - FIFO matching. Pure function, deterministic, fully tested in isolation.
  - Events are sorted by `(date, type-ordering)` where opens come before closes on the same day.
  - One sell against multiple opening lots emits one `RealizedMatch` per consumed lot.
- `fx.ts` — `convertToEur(event, fxRates)`; flags `requires_review` when no rate is found for the date.
- `summary.ts` — derives the high-level numbers each Pulse screen needs (`PortfolioSummary`, `BrokerBreakdown`, `EquityCurve`, `AllocationByCurrency`, `DividendsByMonth`, `TopPayers`).

Cross-broker holdings stay **separate** per `broker_account_id` (a USD position at IBKR is not the same lot as the same symbol at Freedom). Merge happens only at the aggregation/display layer via the topbar broker filter (`all | ff | ibkr`).

### 4.4 `lib/quotes` — current prices
- `yahoo.ts` — fetches `{symbol → {regularMarketPrice, regularMarketTime, currency}}` for a batch of symbols
- `symbol-map.ts` — handles the IBKR ↔ Yahoo symbol divergence (e.g. `BRK B` → `BRK-B`, German `XSX7` → `XSX7.DE`)
- `cache.ts` — read/write `quote_cache` Drizzle queries with TTL

### 4.5 `lib/tax` — German tax
- `german-tax.ts` — `buildAnlageKap({ taxYear, ownerId, lots, matches, dividends, fees, settings }): GermanTaxDraft`
  - Fills KAP lines: `Z19` capital income (dividends + interest), `Z20` of which foreign, `Z21`, `Z22` of which from share sales, `Z41` already-paid Abgeltungsteuer, `Z51` foreign WHT paid, `Z52` foreign WHT eligible for offset.
  - Applies Sparer-Pauschbetrag (€1,000 single / €2,000 joint, configurable in Settings).
  - Reads prior-year loss carry-forward from the previous year's `tax_reports.status='FINAL'`.
- `export-pdf.ts` — `renderKapPdf(draft): ReadableStream` using `@react-pdf/renderer`.
- `export-csv.ts` — `renderEvidenceCsv(draft): string` — every realized match + every dividend with date, ticker, ISIN, gross, WHT, ECB rate, EUR amount, broker, source statement.

### 4.6 `lib/imports`
- `fingerprint.ts` — `fingerprintEvent(e)` hashes `broker | accountNumber | date | type | symbol | qty | amount | currency` → idempotent re-imports.
- `ingest.ts` — `ingestParsedImport(ownerId, parsed)` — the persistence pipeline used by the API route.

### 4.7 `lib/data` — owner-scoped Drizzle queries
- `portfolio.ts`, `positions.ts`, `dividends.ts`, `imports.ts`, `tax.ts`, `settings.ts`
- Every exported function takes `ownerUserId` first. A unit test asserts that pattern via a glob over the file.

### 4.8 `app/` — routes
- `(auth)/sign-in/page.tsx` — Better Auth UI
- `(app)/layout.tsx` — Pulse shell (topbar with logo, primary nav, broker filter, account chip)
- `(app)/page.tsx` — Dashboard (Pulse 02)
- `(app)/upload/page.tsx` — Upload (Pulse 01)
- `(app)/performance/page.tsx` — Performance (Pulse 03)
- `(app)/positions/page.tsx` — Positions (Pulse 04)
- `(app)/dividends/page.tsx` — Dividends (Pulse 05)
- `(app)/tax/[year]/page.tsx` — Tax report (Pulse 06)
- `(app)/tax/[year]/export/route.ts` — GET → PDF/CSV
- `(app)/settings/page.tsx` — Settings (Pulse 07)
- `api/imports/ingest/route.ts` — POST normalized events
- `api/imports/[id]/route.ts` — DELETE (cascades to transactions, triggers replay)
- `api/cron/fx/route.ts`, `api/cron/quotes/route.ts` — auth-gated cron handlers
- `api/auth/[...all]/route.ts` — Better Auth catch-all

### 4.9 `components/pulse` — the Pulse design system
- `topbar.tsx`, `card.tsx`, `palette.ts`, `donut.tsx`, `perf-chart.tsx`, `metric-tile.tsx`, `pill.tsx`, `setting-row.tsx`, `toggle-row.tsx`
- These mirror the prototype's component vocabulary (`ATopbar`, `ACard`, `Donut`, `PerfChart`) so each Pulse screen page composes them rather than re-inventing.
- `palette.ts` exports tokens from `tailwind.config.ts` — colors come from CSS variables so the user-configurable accent palette in Settings actually works.

## 5. Data model

All tables owner-isolated via `owner_user_id text NOT NULL references user(id) on delete cascade`, except FX rates and quote cache which are global (shared across users — they're the same numbers for everyone).

| Table | Purpose | Notable columns |
|---|---|---|
| `user`, `session`, `account`, `verification` | Better Auth identity tables | — |
| `broker_accounts` | One row per (user, broker, account#) | unique `(owner, broker, account_number)` |
| `imports` | Audit row per parsed file (no file body stored) | `file_hash` (unique per owner), `event_count`, `inserted_event_count`, `duplicate_event_count`, `statement_start_date`, `statement_end_date`, `status` |
| `transactions` | Normalized event log — single source of truth | unique `(owner, broker_account_id, event_fingerprint)`; indexed by `event_date`; raw payload in `jsonb` for forensic re-checks |
| `lots` *(new)* | Open FIFO lots after replay | `(owner, broker_account_id, symbol, opened_at)`, `remaining_qty`, `cost_eur` |
| `realized_matches` *(new)* | Closed-lot match audit trail | links sell event → opening lots; stores `cost_eur`, `proceeds_eur`, `gain_eur`, `holding_days`, `is_long_term` |
| `positions` | Current snapshot (qty + value by symbol) | refreshed after every ingest and after every quote cron run |
| `instruments` | Symbol/ISIN/name dictionary | unique per owner; written lazily on first sighting |
| `fx_rates` *(global)* | ECB daily rates, EUR base | unique `(date, from_currency)` — **no owner column** |
| `quote_cache` *(global)* | Yahoo daily closes | unique `(symbol, date)` — **no owner column** |
| `tax_reports` | Per-year KAP draft state machine (`DRAFT` / `FINAL`) | unique `(owner, tax_year)` |
| `tax_report_lines` | Snapshot of the seven KAP numbers + evidence | unique `(tax_report_id, line_key)` |
| `user_settings` | Filing status, jurisdiction, allowance, accent palette | one row per user |

Schema reuse: the WIP `src/lib/db/schema.ts` covers most of this already. The **delta**: add `lots`, `realized_matches`, `quote_cache`, `user_settings`; drop the `owner_user_id` column from `fx_rates` so it can be shared. A single Drizzle migration produces this delta.

## 6. Critical flows

### 6.1 Upload → Ingest
1. User drops a CSV/JSON onto the upload dropzone.
2. Page hands the `File` to `lib/brokers/worker.ts` (Web Worker).
3. Worker decodes bytes, sniffs broker, runs the parser, produces `ParsedBrokerStatement` + `fileHash` (SHA-256 of file bytes).
4. Worker `postMessage`s the result back; page POSTs `{ broker, fileName, fileHash, taxYear, account, events }` to `/api/imports/ingest`.
5. Handler runs inside a single Drizzle transaction:
   - `requireCurrentUser()` → `ownerUserId`
   - Re-validate payload with Zod (events are *untrusted*).
   - Upsert `broker_accounts` row → `brokerAccountId`.
   - If `imports.file_hash` already exists for this owner → return `{ duplicate: true }` early.
   - For each event: recompute `event_fingerprint`, look up `fx_rates(date, currency)`; if found, fill `*_eur` columns and `fx_source='ECB'`; if missing, set `requires_review=true, fx_source='MISSING'`.
   - Bulk insert into `transactions` with `ON CONFLICT (owner, broker_account_id, event_fingerprint) DO NOTHING`.
   - Call `replayLedger(ownerId, brokerAccountId)` → rewrites `lots`, `realized_matches`, `positions` for that account.
   - Insert `imports` summary row.
   - Return `ImportSummary { insertedCount, duplicateCount, reviewCount }`.
6. UI optimistically appends the file to the "Recently uploaded" list, then reconciles with the server response.

### 6.2 Ledger replay (FIFO)
Pure function `replay(events: NormalizedEvent[], openLots: Lot[] = []) → { lots, matches, positions }`:
- Sort events: `(date asc, typeOrder asc, fingerprint asc)` — opens before closes on same day, fees last.
- For `TRADE` BUY (`qty > 0`): push lot `{ symbol, opened_at: date, remaining_qty: qty, cost_eur: |amountEur| + feeEur, source_event_id: id }`.
- For `TRADE` SELL (`qty < 0`): pop oldest lots until `|qty|` consumed; per consumption emit a `RealizedMatch { opening_event_id, closing_event_id, qty, cost_eur, proceeds_eur, gain_eur, holding_days, is_long_term: holding_days >= 365 }`.
- `CORPORATE_ACTION` events: v1 enqueue them into `review_queue` but do **not** auto-modify lots.
- Returns the final lot list, the match list, and a `positions` snapshot keyed by `(broker_account_id, symbol)`.
- Re-runnable: replay is invoked from scratch on each ingest, so any past bug fix to the replay logic propagates automatically.

### 6.3 Tax draft (Anlage KAP)
`/tax/[year]/page.tsx` calls `buildAnlageKap({ taxYear, ownerId })`:
1. Read settings (filing status, allowance, jurisdiction).
2. Read all `transactions` + `realized_matches` for the year.
3. Compute:
   - `Z19` = Σ DIVIDEND.amountEur (gross) + Σ INTEREST.amountEur
   - `Z20` = Σ over non-DE-source DIVIDEND + INTEREST
   - `Z22` = Σ realized_matches.gain_eur (positive)
   - `loss_pool` = Σ realized_matches.gain_eur (negative) split into share-sale vs. other (per § 20 Abs. 6 EStG)
   - `Z41` ≈ 0 (non-DE brokers don't withhold Abgeltungsteuer)
   - `Z51` = Σ WITHHOLDING_TAX.amountEur
   - `Z52` = portion of `Z51` eligible for offset (capped at 15 % of underlying dividend by treaty for US; treaty caps held in `lib/tax/treaties.ts` as a country → cap-rate map)
4. Apply Sparer-Pauschbetrag (€1,000 single / €2,000 joint), then prior-year loss carry-forward.
5. Output a `GermanTaxDraft` with: seven KAP line values, EUR totals, evidence list (every line traces back to event IDs), review flags.
6. PDF rendered by `@react-pdf/renderer` — title page with totals, per-line breakdown, per-line evidence list. CSV is the raw evidence as one row per match/dividend with ECB rate, source statement, fingerprint. Both stream from `/tax/[year]/export?format=pdf|csv`.
7. User types the seven numbers into ELSTER's web form and keeps the PDF as a personal record.

### 6.4 FX & quote crons
Configured in `vercel.ts`:
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
Both handlers verify `request.headers.get('authorization') === 'Bearer ' + process.env.CRON_SECRET` (Vercel injects this automatically when invoking the cron). Hobby plan allows two crons — this fits exactly.

- `/api/cron/fx`: fetches `eurofxref-daily.xml`, upserts each EUR-base rate into `fx_rates`, then **backfills `*_eur` columns** for any `transactions` rows whose date now has a rate. Triggers a small recomputation of affected tax draft snapshots.
- `/api/cron/quotes`: collects the distinct `(symbol, currency)` set across all users' open positions (small — bounded by 3–5 users × ~30 symbols), batches into Yahoo's quote endpoint (≤100 symbols per call), upserts into `quote_cache`. Failures are non-fatal — the UI falls back to broker statement close prices marked "as of {statementEnd}".

### 6.5 Auth & multi-tenancy
- Better Auth wired in `lib/auth/setup.ts` with Google + GitHub OAuth providers.
- `AUTHORIZED_EMAILS` env var (comma-separated allowlist) is checked in the sign-in callback (`lib/auth/allowlist.ts`); unauthorized emails get a friendly "ask the owner to add you" page.
- All RSC pages call `requireCurrentUser()` (redirects to `/sign-in` if missing) and pass the user id into every data-access function.
- A Playwright e2e suite `tests/e2e/owner-isolation.spec.ts` asserts that user B cannot see user A's data via any UI or API path.

## 7. Error handling

| Failure | Handling |
|---|---|
| Parser throws on malformed file | Worker catches, posts `{ error: 'PARSE_FAILED', detail }` → UI shows the file with `status=error` in the recent list and the error message inline. No server call. |
| Ingest payload fails Zod | Server returns 400 with field paths; UI surfaces a "this looks corrupted" toast and marks the file as failed. |
| Duplicate file hash | Server returns 200 `{ duplicate: true, importId }`; UI shows "Already imported on {date}". |
| FX rate missing on event date | Event saved with `fx_source='MISSING'`, `requires_review=true`. The Tax page shows a banner: "{N} events need FX review" linking to a filterable list where the user can pick a rate manually or wait for the next FX cron to backfill. |
| Yahoo quote API rate-limit/error | Cron logs + retries next day; positions page renders with `priceAsOf=statementEnd` badge instead of failing. |
| ECB endpoint down | Cron retries hourly within the same day; tax export warns "FX rates last updated {date}". |
| Vercel function timeout (300 s) | Ingest is bounded by `events.length` — for the supplied samples, parse + insert runs in <2 s. If a future statement is huge we chunk events server-side in 5,000-row batches. |
| User deletes an import | Cascades to its transactions, then triggers a full replay for affected broker accounts. Any tax_reports that included those events become `DRAFT` again with a "regenerate" CTA. |

The general rule: **never lose data silently**. Every parse/ingest/FX/quote failure leaves a row somewhere with a status, so the UI can always explain why a number is missing.

## 8. Testing strategy

| Layer | Tool | Tests |
|---|---|---|
| Parsers | Vitest | Load the three real IBKR CSVs and the real FF JSON. Assert event counts, totals (Σ trade amount), Σ dividend amount, a hand-picked few rows. These files are the spec — if the parser drifts, the test breaks first. |
| Ledger replay | Vitest | Curated 20-event fixture covering: buy, partial sell, full sell, multiple opens before close, fee on trade, ISIN-only instrument, mid-year cost basis check. Golden output JSON. |
| FX conversion | Vitest | Mock `fx_rates`, assert EUR amounts, assert `requires_review` flag when rate missing. |
| Tax engine | Vitest | Golden test: fixture portfolio + fixture rates → snapshot the seven KAP lines + evidence count. |
| Ingest API | Vitest + ephemeral Neon branch | POST events, then POST again — second call must report `duplicate: true` and not double-insert. Owner isolation: POST as user A, GET as user B → 404. |
| PDF export | Vitest snapshot + Playwright download | Generate KAP PDF for fixture year, assert byte length is in a reasonable band and that the text layer contains expected line labels. |
| UI golden path | Playwright | Sign in → upload one IBKR CSV → land on Dashboard → numbers match expected totals → tax page renders → PDF download succeeds. Runs against `npm run dev` locally and against a preview deploy in CI. |

**Run before any merge:**
```
pnpm test            # vitest
pnpm test:e2e        # playwright
pnpm typecheck       # tsc --noEmit
pnpm lint            # eslint
```

## 9. Free-tier resource budget

| Resource | Limit | Expected | Headroom |
|---|---|---|---|
| Vercel Hobby bandwidth | 100 GB/mo | <1 GB | ✓ |
| Function invocations | 100k/day | ~1k | ✓ |
| Cron jobs | 2 per project | 2 | ✓ exact |
| Function body size | 4.5 MB | ~200 KB for 1k events | ✓ |
| Function duration | 300 s (Fluid Compute default) | <2 s ingest | ✓ |
| Neon storage | 0.5 GB | ~50 MB (3 users × 5 yrs × ~30k events) | ✓ |
| Neon compute hours | autoscale-to-zero | <10 h/mo | ✓ |

No paid services needed for v1.

## 10. Open items (non-blocking)

- **Ticker normalization across brokers** — IBKR's `EVO` vs. Freedom's instrument name. Plan: prefer ISIN match, fall back to symbol; store both on `instruments`. Conflicts go to a small admin reconcile screen accessible only to the project owner.
- **Splits / spin-offs** — corporate actions surface in a review queue; v1 does not auto-rebase lots.
- **IBKR base-currency totals** — IBKR computes its own EUR conversion; we recompute with ECB rates per-trade-date. Discrepancies expected (≤1 %); reconciliation is informational, not a hard error.
- **Email magic-link sign-in** — defer. Add Resend (free 3k/mo) only if a friend lacks Google or GitHub.

## 11. Verification checklist (before declaring v1 done)

- [ ] All four parser unit tests pass against real sample files.
- [ ] Ledger replay golden test passes.
- [ ] Tax engine golden test passes; PDF + CSV download in dev.
- [ ] Playwright owner-isolation suite passes.
- [ ] Playwright golden-path suite passes locally and on preview deploy.
- [ ] FX cron and quote cron each run successfully on preview deploy at least once.
- [ ] Sign-in works for both Google and GitHub; an unauthorized email is rejected.
- [ ] Manual smoke: import 2023, 2024, 2025 IBKR CSVs + the FF JSON for the same period; numbers cross-foot across Dashboard / Performance / Positions / Dividends / Tax.
