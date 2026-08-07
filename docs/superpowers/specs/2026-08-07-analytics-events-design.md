# Vercel Web Analytics — Custom Event Tracking — Design Spec

Architect deliverable for the `developer` agent, against
`docs/superpowers/specs/2026-08-07-analytics-events-ac.md` (AC-G1…AC-G6,
AC-UP1/UP2, AC-AU1…AU6, AC-TX1…TX3, AC-PO1…PO6, AC-SE1…SE9, AC-NA1,
AC-ON1…ON4). That doc's verification notes (file paths, handler names,
corrected enums) are treated as ground truth; this doc adds the concrete
module shape, the exact insertion point per handler, and resolves the two
places where wiring the AC literally would produce wrong behavior (§4.6,
§4.9).

Skills applied: `software-architecture` (module boundary for the new
`analytics-events.ts`, reuse-over-duplication calls in §4.7/§4.9,
least-privilege framing in §6), `gdpr-compliance` (§6 — data minimization on
the two properties the AC doc itself flagged as needing a bounded allow-list:
`sector`, and the broker enums).

## 0. What changes, in one paragraph

Install `@vercel/analytics`, mount `<Analytics />` once in
`src/app/layout.tsx`. Add one new module, `src/lib/analytics-events.ts`,
exporting one small typed function per event (24 events total) — each
function's parameter list *is* the allow-list, so a call site cannot pass an
extra/misspelled key; there is no generic `track(name, props)` escape hatch
exported from this module for feature code to call directly. Every call site
in the AC doc's §1–§6 gets exactly one (occasionally two) call to one of
these functions, placed at the specific handler branch identified below.
Three files need a `"use client"` boundary they don't have today
(`tax-year-selector.tsx`, `dividends-table.tsx`, plus one new small component,
`tax-export-link.tsx`, for the anlage-so page's export links). One existing
component (`welcome-tour.tsx`) needs a small internal refactor (not a
behavior change) to stop `finish()` from routing through `dismiss()`, so the
two onboarding events stay mutually exclusive per AC-ON3/AC-ON4's corrected
mapping.

## 1. Base setup

```
pnpm add @vercel/analytics
```

`src/app/layout.tsx` (currently a bare Server Component shell, no
`"use client"`):

```tsx
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";

// ...unchanged...

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-bg text-ink font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

**Suspense boundary — confirm at install time, don't guess.** `@vercel/analytics/react`'s `Analytics` export ships its own `"use client"`
directive, so a Server Component (`RootLayout`, unchanged) can render it
directly — this is the same pattern as `next/font`'s exports, not a reason to
convert the layout itself to a Client Component. Whether a `<Suspense>`
wrapper is additionally required depends on whether the shipped component
reads `useSearchParams()` (which forces the *nearest* Suspense boundary,
per Next.js's own dynamic-API rules) versus only `usePathname()`/`useParams()`
(which does not). Official Vercel setup docs for the current major version do
not show a Suspense wrapper, but this repo's own precedent
(`2026-08-06-email-verification-gate-design.md` §1) is to verify library
internals against the actually-installed source rather than trust
recollection. **Developer: after `pnpm add`, grep the installed package**
(`node_modules/@vercel/analytics/dist/react/index.mjs` or equivalent) for
`useSearchParams`; if present, wrap `<Analytics />` in `<Suspense fallback={null}>`
in the layout, if absent, no wrapper is needed. Either way this is a
self-contained, low-risk one-line change — flag the outcome in the PR
description for `code-reviewer`, no need to route it through a heavier
review.

Mounted in the root layout (not the `(app)` route group) so `/sign-in`,
`/verify-email`, `/reset-password` are covered too, per AC-G4.

**CSP:** confirmed — `next.config.ts`'s `headers()` deliberately does not set
a `Content-Security-Policy` today (documented inline: "intentionally omitted
... a permissive one would be theatre"). No CSP change is needed for
`@vercel/analytics`'s script/beacon calls to work; if a CSP is added in a
future change, it will need to allow the Vercel Analytics/Speed Insights
script and beacon origins at that time — out of scope here.

**Next.js security-floor note (CLAUDE.md):** not relevant to this change.
`@vercel/analytics` has no interaction with `middleware.ts` (this repo has
none — confirmed in the email-verification-gate design doc) or with the
`x-middleware-subrequest` CVE-2025-29927 surface. The existing `^15.1.0` /
`>=15.2.3` floor gap is unrelated and intentionally left untouched, per
CLAUDE.md's instruction not to silently bump it.

## 2. `src/lib/analytics-events.ts` — module design

Deliberately a top-level `src/lib/` sibling of the unrelated
`src/lib/analytics/` directory (portfolio-calculation pure functions), not
nested inside it — different domain, different audience (this module is
UI-event plumbing; `src/lib/analytics/` is financial-analytics math), per
the AC doc's own scoping.

### 2.1 Enforcement mechanism (AC-G1/AC-G5)

One exported function per event, each with a fixed, named-property parameter
type (no index signature, no generic `props: Record<string, unknown>`
escape hatch). This is AC-G5's first option ("one typed function per event"),
chosen over the discriminated-union `track(event, props)` alternative
because:
- It's structurally impossible for a call site to add a stray key — TS
  would need to widen the function's own declared parameter type, which is
  a change to this file, not the call site.
- Each function is independently mockable/spyable in tests (`vi.spyOn` /
  module mock on a single named export) without needing a
  discriminated-union type guard in the test itself.
- It matches this codebase's existing style in `src/lib/analytics/` — many
  small, single-purpose exports rather than one generic entry point.

All 24 functions funnel through one private `send()` that owns AC-G6 (never
let a tracking failure break app functionality) and AC-G4's payload
allow-list guarantee at the boundary to `@vercel/analytics`:

```ts
import { track } from "@vercel/analytics";

/** AC-G6: analytics must never throw into caller code (ad-blocker, offline,
 *  @vercel/analytics not yet loaded, etc. are all expected, non-exceptional
 *  conditions here, not bugs). */
function send(name: string, props?: Record<string, string | number | boolean>): void {
  try {
    if (props) track(name, props);
    else track(name);
  } catch {
    // Intentionally silent — see AC-G6. Do not log to console in production
    // paths for a routine ad-blocker case; if this ever needs debugging,
    // gate a console.warn behind `process.env.NODE_ENV !== "production"`.
  }
}
```

### 2.2 Shared enums (AC-G3)

```ts
/** Statement-upload / broker-account enum. Coinbase never appears here —
 *  no statement-upload path exists for it (AC-G3, AC-SE2). */
export type UploadBroker = "ibkr" | "freedom" | "revolut";

/** Positions/Dividends broker-*filter* enum — a DIFFERENT taxonomy, do not
 *  conflate with UploadBroker (AC-G3). Not currently wired to any AC event
 *  (broker-filter.tsx has no assigned AC id), included here only so the
 *  type exists in one place if a future event needs it. */
export type PositionsBrokerFilter = "all" | "ff" | "ibkr";

/** Maps the DB's 4-value broker enum (`src/lib/db/schema.ts` brokerEnum:
 *  INTERACTIVE_BROKERS | FREEDOM_FINANCE | COINBASE | REVOLUT) down to the
 *  3-value UploadBroker analytics enum. Returns `null` for "COINBASE",
 *  which every current call site has already filtered out before reaching
 *  here (upload-dropzone.tsx only ever sees a parsed statement's
 *  BrokerId, which structurally excludes COINBASE — brokers/types.ts's
 *  `brokerIds` has only 3 values; reset-broker-button's caller filters
 *  `b.broker !== "COINBASE"` before rendering the button, see §4.8) — the
 *  `null` return is a defensive backstop, not an expected path, so callers
 *  simply skip firing the event on `null` rather than throwing.
 */
export function toUploadBroker(
  broker: "INTERACTIVE_BROKERS" | "FREEDOM_FINANCE" | "COINBASE" | "REVOLUT",
): UploadBroker | null {
  switch (broker) {
    case "INTERACTIVE_BROKERS": return "ibkr";
    case "FREEDOM_FINANCE": return "freedom";
    case "REVOLUT": return "revolut";
    case "COINBASE": return null;
  }
}
```

### 2.3 Sector allow-list (AC-PO2's flagged risk — resolved)

Verified in `src/lib/analytics/sector-map.ts`: `normalizeSector()`'s
`default:` branch **passes through unrecognized provider labels verbatim**
(Title-Cased) — e.g. an obscure FMP/Yahoo sector string the map doesn't
recognize reaches `positions.ts`'s `sectors: string[]` (and therefore
`SectorFilter`'s pills) unbounded. This confirms AC-PO2's own flag: sector
values are *usually* one of a fixed canonical set but are not
*structurally* guaranteed to be. Resolution: clamp at the analytics
boundary, not at the display boundary (the display should still show
whatever label helps the user; only the tracked property needs
minimization, per `gdpr-compliance`'s data-minimization principle):

```ts
const KNOWN_SECTORS = new Set([
  "Tech", "Financials", "Healthcare", "Consumer", "Energy", "Industrials",
  "Materials", "Real Estate", "Communication", "Utilities", "ETF", "Other",
]);

/** AC-PO2: never forward an unbounded, provider-sourced sector label to
 *  analytics. `normalizeSector()`'s default branch can pass through an
 *  unrecognized provider string verbatim — clamp anything outside the
 *  canonical set to "Other" before tracking (display is unaffected; this
 *  only guards the analytics property). */
function sanitizeSectorForAnalytics(sector: string): string {
  return sector === "all" ? "all" : KNOWN_SECTORS.has(sector) ? sector : "Other";
}
```

(`"all"` is `SectorFilter`'s own sentinel for the unfiltered pill, not a
provider-sourced value — pass it through unchanged.)

### 2.4 Instrument link source-domain classifier (AC-PO3)

```ts
export type InstrumentLinkSourceDomain = "yahoo" | "justetf" | "google" | "stockopedia" | "other";

/** Client-side only, derived from the pasted URL's hostname — never send
 *  the raw URL/path/query (AC-PO3's forbidden list). */
export function classifyInstrumentLinkSourceDomain(url: string): InstrumentLinkSourceDomain {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("yahoo")) return "yahoo";
    if (host.includes("justetf")) return "justetf";
    if (host.includes("google")) return "google";
    if (host.includes("stockopedia")) return "stockopedia";
    return "other";
  } catch {
    return "other";
  }
}
```

### 2.5 The 24 event functions

Grouped and named to match the AC IDs 1:1. Every function with no allowed
properties takes no parameters (so `send(name)` is called with no second
argument — `track()` fires with no payload rather than an empty `{}`,
matching AC wording "fires with no properties").

```ts
// --- Upload (AC-UP1/UP2) ---
export function trackUploadFilesSelected(count: number): void {
  send("upload_files_selected", { count });
}
export function trackUploadFileIngested(broker: UploadBroker, result: "success" | "error"): void {
  send("upload_file_ingested", { broker, result });
}

// --- Auth (AC-AU1..AU6) ---
export function trackSignInSubmitted(): void { send("sign_in_submitted", { mode: "sign-in" }); }
export function trackSignInSucceeded(): void { send("sign_in_succeeded", { mode: "sign-in" }); }
export function trackSignInFailed(reason: "invalid_credentials" | "email_not_verified"): void {
  send("sign_in_failed", { mode: "sign-in", reason });
}
export function trackSignUpSubmitted(): void { send("sign_up_submitted", { mode: "sign-up" }); }
export function trackSignUpAccepted(): void { send("sign_up_accepted", { mode: "sign-up" }); }
export function trackSignUpFailed(): void { send("sign_up_failed", { mode: "sign-up" }); }

// --- Tax (AC-TX1..TX3) ---
export function trackTaxYearChanged(year: number): void { send("tax_year_changed", { year }); }
export function trackLossHarvestActionTaken(action: "auto_pick" | "clear" | "adjust_qty"): void {
  send("loss_harvest_action_taken", { action });
}
export function trackTaxExportClicked(form: "anlage_kap" | "anlage_so", format: "pdf" | "csv"): void {
  send("tax_export_clicked", { form, format });
}

// --- Positions / Dashboard (AC-PO1..PO6) ---
export function trackPositionsSortChanged(sort: "value" | "gain" | "az"): void {
  send("positions_sort_changed", { sort });
}
export function trackPositionsSectorFiltered(sector: string): void {
  send("positions_sector_filtered", { sector: sanitizeSectorForAnalytics(sector) });
}
export function trackInstrumentLinkSubmitted(sourceDomain: InstrumentLinkSourceDomain): void {
  send("instrument_link_submitted", { sourceDomain });
}
export function trackPositionsPnlModeChanged(mode: "broker" | "net"): void {
  send("positions_pnl_mode_changed", { mode });
}
export function trackDividendsExportClicked(): void { send("dividends_export_clicked"); }
export function trackPerformanceRangeChanged(
  range: "1M" | "3M" | "6M" | "YTD" | "1Y" | "2Y" | "ALL",
): void {
  send("performance_range_changed", { range });
}

// --- Settings (AC-SE1..SE9) ---
export function trackSettingsBrokerResetConfirmed(broker: UploadBroker): void {
  send("settings_broker_reset_confirmed", { broker });
}
export function trackSettingsCoinbaseConnected(): void { send("settings_coinbase_connected"); }
export function trackSettingsCoinbaseSyncClicked(): void { send("settings_coinbase_sync_clicked"); }
export function trackSettingsCoinbaseDisconnected(): void { send("settings_coinbase_disconnected"); }
export function trackSettingsMemberAdded(): void { send("settings_member_added"); }
export function trackSettingsMemberRevoked(): void { send("settings_member_revoked"); }
export function trackSettingsTaxIncomeSaved(): void { send("settings_tax_income_saved"); }
export function trackSettingsFxBackfillClicked(): void { send("settings_fx_backfill_clicked"); }
export function trackSettingsQuotesRefreshClicked(): void { send("settings_quotes_refresh_clicked"); }

// --- Nav / Onboarding (AC-NA1, AC-ON1..ON4) ---
export type NavDestination =
  | "dashboard" | "performance" | "positions" | "crypto" | "dividends" | "tax" | "upload";
export function trackNavLinkClicked(destination: NavDestination): void {
  send("nav_link_clicked", { destination });
}
export function trackOnboardingTourStarted(trigger: "auto" | "manual"): void {
  send("onboarding_tour_started", { trigger });
}
export function trackOnboardingPlatformToggled(platform: "ibkr" | "freedom" | "coinbase"): void {
  send("onboarding_platform_toggled", { platform });
}
export function trackOnboardingTourDismissed(via: "close_button" | "skip_button" | "escape_key"): void {
  send("onboarding_tour_dismissed", { via });
}
export function trackOnboardingTourCompleted(nextAction: "upload" | "settings" | "explore"): void {
  send("onboarding_tour_completed", { nextAction });
}
```

`send`, `toUploadBroker`, `sanitizeSectorForAnalytics`,
`classifyInstrumentLinkSourceDomain` are the only non-`track*` exports —
everything else feature code calls is one of the 24 named functions above.
This is the concrete shape `code-reviewer` should check call sites against:
**any `import { track } from "@vercel/analytics"` outside this one file is a
review-blocking finding.**

## 3. App Router / client-boundary considerations

`track()` (and therefore every `track*` wrapper) can only run in a Client
Component. Per-file status:

| File | Today | Needed |
|---|---|---|
| `upload-dropzone.tsx` | `"use client"` | no change |
| `auth-card.tsx` | `"use client"` | no change |
| `tax-year-selector.tsx` | Server Component (plain `Link`s, no state) | **add `"use client"`** — safe, props are plain serializable (`years: number[]`, `activeYear: number`), no server-only imports |
| `loss-harvest-panel.tsx` | `"use client"` | no change |
| `tax-client.tsx` | `"use client"` | no change |
| `tax/[year]/anlage-so/page.tsx` | async Server Component (`requireCurrentUser`, DB reads) | **cannot** become a Client Component — extract the two export `<a>` tags to a new small Client Component instead (§4.7) |
| `positions-sort.tsx`, `sector-filter.tsx`, `instrument-source-card.tsx`, `pnl-mode.tsx`, `range-picker.tsx` | `"use client"` | no change |
| `dividends-table.tsx` | Server Component | **add `"use client"`** — receives only plain data props today (rows, strings, numbers); no server-only imports to lose |
| `reset-broker-button.tsx`, `crypto-accounts-manager.tsx`, `members-manager.tsx`, `tax-income-row.tsx`, `backfill-fx-button.tsx`, `refresh-quotes-button.tsx` | all `"use client"` | no change |
| `topbar-nav.tsx`, `bottom-nav.tsx` | both `"use client"` | no change |
| `welcome-tour.tsx`, `platform-card.tsx` | both `"use client"` | no change (platform-card.tsx needs no edit at all — see §4.10) |

`RootLayout` itself stays a Server Component (§1) — `<Analytics />` is a
pre-built Client Component leaf, not a reason to convert its parent.

## 4. Per-file insertion points

### 4.1 `src/components/pulse/upload-dropzone.tsx` (AC-UP1, AC-UP2)

```ts
import { trackUploadFilesSelected, trackUploadFileIngested, toUploadBroker } from "@/lib/analytics-events";
```

**AC-UP1**, in `addFiles()`, right after the existing early return:

```ts
function addFiles(fileList: FileList | File[]) {
  const files = Array.from(fileList);
  if (!files.length || processing) return;
  trackUploadFilesSelected(files.length);      // <-- new
  const batch = sortByName(...);
  ...
```

**AC-UP2**, in `processItem()`. Broker is only known once
`parseStatementInWorker` resolves, so hoist a local to carry it across the
try/catch, and skip firing if parsing itself failed before `broker` was
ever assigned (flagged deviation, §4.6):

```ts
async function processItem(item: QueueItem) {
  const { file } = item;
  let broker: UploadBroker | null = null;   // <-- new
  try {
    patchItem(item.id, { status: "parsing", error: undefined });
    const parsed = await parseStatementInWorker(file, parsedYearFor(file));
    broker = toUploadBroker(parsed.broker); // <-- new (parsed.broker is BrokerId, no COINBASE case, but reuse the shared mapper for one source of truth)

    patchItem(item.id, { status: "uploading" });
    ... // unchanged fetch/hash/etc.
    const summary = (await res.json()) as IngestSummary;
    patchItem(item.id, {
      status: summary.duplicate ? "skipped-duplicate" : "done",
      insertedCount: summary.insertedCount,
      duplicateCount: summary.duplicateCount,
    });
    if (broker) trackUploadFileIngested(broker, "success"); // <-- new
    setItems(prev => [...]);
  } catch (err) {
    patchItem(item.id, { status: "failed", error: (err as Error).message });
    if (broker) trackUploadFileIngested(broker, "error"); // <-- new
  }
}
```

**Flagged deviation (explicit, not silent):** if `parseStatementInWorker`
itself throws (broker not yet known), no `upload_file_ingested` fires for
that file — `broker` is genuinely unknowable at that point and the AC's
payload shape has no "unknown" value in its 3-value enum. This is a narrow
gap (parse-level failures, not ingest-level ones) versus AC-UP2's literal
"reaches a terminal state ... fires once per file" — flag for
`code-reviewer`/`tester` to confirm acceptable; the alternative (inventing a
4th enum value or omitting `broker`) would violate AC-G1's fixed allow-list
more directly than dropping the event for this one sub-case.

Do **not** instrument `retryFailed()` / `clearBatch()` — AC doc's own
"flagged as over-tracking risk" note, confirmed: they re-run the same
`processItem()` path, which will emit its own `upload_file_ingested` per
file already.

### 4.2 `src/components/auth/auth-card.tsx` (AC-AU1..AU6)

```ts
import {
  trackSignInSubmitted, trackSignInSucceeded, trackSignInFailed,
  trackSignUpSubmitted, trackSignUpAccepted, trackSignUpFailed,
} from "@/lib/analytics-events";
```

`handleSignIn`:

```ts
async function handleSignIn(e: FormEvent) {
  e.preventDefault();
  setError(null);
  setWaitState(null);
  setPending(true);
  trackSignInSubmitted(); // <-- new, AC-AU1
  try {
    const { error: signInError } = await authClient.signIn.email({ email, password });
    if (signInError) {
      if (isEmailNotVerifiedSignInError(signInError.code)) {
        trackSignInFailed("email_not_verified"); // <-- new, AC-AU3
        setResendState("idle");
        setResendError(null);
        setWaitState({ variant: "blocked-sign-in", correlationId: null });
        return;
      }
      trackSignInFailed("invalid_credentials"); // <-- new, AC-AU3
      setError(mapAuthErrorMessage(signInError.code, signInError.message));
      return;
    }
    trackSignInSucceeded(); // <-- new, AC-AU2
    window.location.href = "/";
  } finally {
    setPending(false);
  }
}
```

`handleSignUp` — note AC-AU4 conditions `sign_up_submitted` on *passing*
the client-side password check, and AC-AU6 fires `sign_up_failed` even for
that pre-flight rejection (it never reaches the server call):

```ts
async function handleSignUp(e: FormEvent) {
  e.preventDefault();
  setError(null);
  if (!isPasswordLongEnough(password)) {
    setError(mapAuthErrorMessage("PASSWORD_TOO_SHORT"));
    trackSignUpFailed(); // <-- new, AC-AU6 (password-too-short case)
    return;
  }
  trackSignUpSubmitted(); // <-- new, AC-AU4 (only after the check passes)
  setPending(true);
  try {
    ...
    const { error: signUpError } = await authClient.signUp.email({ ... });
    if (signUpError) {
      setError(mapAuthErrorMessage(signUpError.code, signUpError.message));
      trackSignUpFailed(); // <-- new, AC-AU6 (server-side rejection)
      return;
    }
    trackSignUpAccepted(); // <-- new, AC-AU5
    setResendState("idle");
    setResendError(null);
    setWaitState({ variant: "signup", correlationId: signupAttemptId, startedAtMs: Date.now() });
  } finally {
    setPending(false);
  }
}
```

**OAuth (`handleOAuth`) and `verify-email/page.tsx` / `reset-password/page.tsx`: leave untracked**, per the AC doc's own recommendation (option (a) — non-invasive). Do not add a `mode` query param to `buildVerifyEmailCallbackURL` for this change; that callback URL is load-bearing for the anti-enumeration/cross-device-grant design in
`2026-08-06-email-verification-gate-design.md` §2/§3 and must not be touched
casually, exactly as the AC doc warns.

### 4.3 `src/components/pulse/tax-year-selector.tsx` (AC-TX1)

Add `"use client"` (§3). `onClick` on the existing `Link` fires the event
without `preventDefault`, so navigation is unaffected:

```tsx
"use client";
import Link from "next/link";
import { trackTaxYearChanged } from "@/lib/analytics-events";

export function TaxYearSelector({ years, activeYear }: { years: number[]; activeYear: number }) {
  if (years.length <= 1) return null;
  return (
    <div role="tablist" aria-label="Tax year" className="...">
      {years.map((y) => (
        <Link
          key={y}
          role="tab"
          aria-selected={y === activeYear}
          href={`/tax/${y}` as never}
          onClick={() => trackTaxYearChanged(y)}  // <-- new
          className="..."
        >
          {y}
        </Link>
      ))}
    </div>
  );
}
```

### 4.4 `src/components/pulse/loss-harvest-panel.tsx` (AC-TX2)

One insertion point covers all three AC-TX2 branches, because the per-row
stepper and the quick-fill button both already funnel through the same
`setQty` callback (`onSetQty` prop passed to `CandidateRow`) — no new
plumbing needed, just the existing single choke point:

```ts
import { trackLossHarvestActionTaken } from "@/lib/analytics-events";

const setQty = useCallback((c: HarvestCandidate, qty: number) => {
  trackLossHarvestActionTaken("adjust_qty"); // <-- new — covers stepper AND quick-fill
  const key = `${c.symbol}.${c.broker}`;
  ...
  updateUrl(next);
}, [optimisticSells, updateUrl]);

const applyOptimum = useCallback(() => {
  trackLossHarvestActionTaken("auto_pick"); // <-- new
  updateUrl(optimum);
}, [optimum, updateUrl]);

const clearAll = useCallback(() => {
  trackLossHarvestActionTaken("clear"); // <-- new
  updateUrl([]);
}, [updateUrl]);
```

No `symbol`/`broker`/`qty`/loss-amount is read into the tracked call —
`c`/`qty` stay local to the handler, matching AC-TX2's forbidden list.
These are pure client-state transitions (no fetch/mutation), so there is no
pending/error branching to reuse here — the event always fires
unconditionally when the handler runs.

### 4.5 `tax-client.tsx` + `anlage-so/page.tsx` (AC-TX3)

New shared Client Component, `src/components/pulse/tax-export-link.tsx` —
reused by both surfaces instead of duplicating the tracked-anchor pattern
twice (`software-architecture` modularity):

```tsx
"use client";
import { trackTaxExportClicked } from "@/lib/analytics-events";

export function TaxExportLink({
  href, form, format, className, children,
}: {
  href: string;
  form: "anlage_kap" | "anlage_so";
  format: "pdf" | "csv";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} className={className} onClick={() => trackTaxExportClicked(form, format)}>
      {children}
    </a>
  );
}
```

`tax-client.tsx` (already `"use client"` — just swap the two `<a>` tags):

```tsx
<TaxExportLink href={`/tax/${year}/export?format=pdf`} form="anlage_kap" format="pdf" className="...">Export PDF · Anlage KAP</TaxExportLink>
<TaxExportLink href={`/tax/${year}/export?format=csv`} form="anlage_kap" format="csv" className="...">CSV</TaxExportLink>
```

`tax/[year]/anlage-so/page.tsx` (stays an async Server Component — this is
*why* the extraction is necessary, not optional, per §3):

```tsx
<TaxExportLink href={`/tax/${yearNum}/anlage-so/export?format=pdf`} form="anlage_so" format="pdf" className="...">Export PDF · Anlage SO</TaxExportLink>
<TaxExportLink href={`/tax/${yearNum}/anlage-so/export?format=csv`} form="anlage_so" format="csv" className="...">CSV</TaxExportLink>
```

**Navigation-survival note:** both links navigate the browser to a
file-download route on click; `@vercel/analytics`'s `track()` call is
fire-and-forget and does not need to `await` or block the click — Vercel's
client dispatches via a beacon-style transport designed to survive the page
unload that follows a clicked outbound/download link. No `preventDefault`
+ delayed-navigation dance is needed or wanted here.

### 4.6 Positions / Dashboard (AC-PO1..PO6)

`positions-sort.tsx` — inside the existing `onClick`, before `router.replace`:

```ts
onClick={() => {
  trackPositionsSortChanged(o.key); // <-- new
  const p = new URLSearchParams(sp.toString());
  ...
}}
```

`sector-filter.tsx` — same pattern, tracks the raw `s` (the sanitize step
lives inside `trackPositionsSectorFiltered`, §2.3, so this call site stays
simple):

```ts
onClick={() => {
  trackPositionsSectorFiltered(s); // <-- new (s is "all" or a sector string)
  const p = new URLSearchParams(sp.toString());
  ...
}}
```

`instrument-source-card.tsx` — inside `submit()`'s success branch, before
`router.refresh()`:

```ts
if (data?.status === "OK") {
  trackInstrumentLinkSubmitted(classifyInstrumentLinkSourceDomain(trimmed)); // <-- new
  router.refresh();
  return;
}
```

Only the success (`"OK"`) branch fires — a `NOT_FOUND`/error result is not
"submitted," it's a rejected submission (matches AC-PO3's Given/When
framing: "when the user submits a pasted link" that resolves, not attempts).
**`instrument_link_result` follow-up event: not implemented this pass** —
the AC doc marks it optional/architect's-call; adding a second event here
is deferred to keep this change's surface area matching the AC's core
taxonomy, consistent with the AC's own over-tracking caution elsewhere
(AC-UP2's flagged retry/clear buttons). Revisit if usage data shows the
`instrument_link_submitted` volume needs a success/failure split.

`pnl-mode.tsx` — inside `PnlModeToggle`'s two button `onClick`s (not inside
the generic `setMode` in the context, which is only ever called from these
two buttons today per the grep-verified caller list — but tracking at the
call site rather than inside the shared `setMode` keeps the context/hook
free of an analytics dependency for any future non-toggle caller):

```tsx
<button
  onClick={() => { trackPositionsPnlModeChanged("broker"); setMode("broker"); }} // <-- new
  ...
>Broker</button>
<button
  onClick={() => { trackPositionsPnlModeChanged("net"); setMode("net"); }} // <-- new
  ...
>Net</button>
```

`dividends-table.tsx` — add `"use client"` (§3), track on the export anchor:

```tsx
"use client";
import { trackDividendsExportClicked } from "@/lib/analytics-events";
...
trailingHeader={
  <a href={exportHref} onClick={trackDividendsExportClicked} className="...">
    export csv →
  </a>
}
```

`range-picker.tsx` — inside `pick()`:

```ts
function pick(r: Range) {
  trackPerformanceRangeChanged(r); // <-- new
  const params = new URLSearchParams(sp.toString());
  ...
}
```

### 4.7 Settings (AC-SE1..SE9)

`reset-broker-button.tsx` needs a new prop — it currently only receives
`brokerLabel` (free text), not a typed broker id, so AC-SE1's requirement
("derived from the broker account's own broker id, not the free-text
`brokerLabel`") needs one new prop threaded from the settings page:

```ts
// reset-broker-button.tsx
export function ResetBrokerButton({
  brokerAccountId, brokerLabel, accountNumber, broker, // <-- new prop
}: {
  brokerAccountId: string;
  brokerLabel: string;
  accountNumber: string;
  broker: UploadBroker; // <-- new
}) {
  ...
  async function confirm() {
    ...
    try {
      const res = await fetch("/api/imports/reset", { ... });
      if (!res.ok) { ... }
      trackSettingsBrokerResetConfirmed(broker); // <-- new, success only
      setOpen(false);
      router.refresh();
    } catch (err) { ... }
    ...
  }
}
```

`settings/page.tsx`'s caller (`statementAccounts` is already pre-filtered to
exclude `COINBASE`, so `toUploadBroker(b.broker)` is non-null here — the
`??` fallback below is a type-safety backstop only, not an expected path):

```tsx
<ResetBrokerButton
  brokerAccountId={b.id}
  brokerLabel={meta.label}
  accountNumber={b.accountNumber}
  broker={toUploadBroker(b.broker) ?? "ibkr"} // <-- new; COINBASE structurally excluded above
/>
```

`crypto-accounts-manager.tsx`:

```ts
async function connect(e: FormEvent) {
  ...
  try {
    const res = await fetch("/api/crypto/coinbase/connect", { ... });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(...);
    setRows((cur) => [body.account, ...cur]);
    trackSettingsCoinbaseConnected(); // <-- new, AC-SE2, success only
    setBlob(""); setLabel("");
    setSuccess(...);
  } ...
}

async function sync(id: string) {
  trackSettingsCoinbaseSyncClicked(); // <-- new, AC-SE3 — fires on click/attempt, top of function
  setPending(true);
  ...
}

async function disconnect(id: string) {
  setPending(true);
  ...
  try {
    const res = await fetch(`/api/crypto/coinbase/${id}`, { method: "DELETE" });
    if (!res.ok) { ... }
    setRows((cur) => cur.filter((r) => r.id !== id));
    trackSettingsCoinbaseDisconnected(); // <-- new, AC-SE4, success only
  } ...
}
```

`members-manager.tsx`:

```ts
async function add(e: FormEvent) {
  ...
  try {
    const res = await fetch("/api/admin/allowlist", { ... });
    ...
    if (!res.ok) throw new Error(...);
    setRows((cur) => { ... });
    trackSettingsMemberAdded(); // <-- new, AC-SE5, success only
    setEmail(""); setNote("");
    router.refresh();
  } ...
}

async function remove(id: string) {
  ...
  try {
    const res = await fetch(`/api/admin/allowlist/${id}`, { method: "DELETE" });
    if (!res.ok) { ... }
    setRows((cur) => cur.filter((r) => r.id !== id));
    trackSettingsMemberRevoked(); // <-- new, AC-SE6, success only
    router.refresh();
  } ...
}
```

`tax-income-row.tsx`, inside `save()`'s success branch — **never** read
`data?.taxableIncomeEur` into the tracked call (AC-SE7's forbidden list):

```ts
const res = await fetch("/api/settings/tax-income", { ... });
const data = await res.json().catch(() => null);
if (!res.ok) throw new Error(...);
trackSettingsTaxIncomeSaved(); // <-- new, AC-SE7, no properties, success only
setSaved(data?.taxableIncomeEur ?? "");
...
```

`backfill-fx-button.tsx` / `refresh-quotes-button.tsx` — both fire on
click/attempt (AC-SE8/SE9 explicitly say not gated on success), so at the
top of `run()`, before the `fetch`:

```ts
async function run() {
  trackSettingsFxBackfillClicked(); // <-- new (or trackSettingsQuotesRefreshClicked in the other file)
  setPending(true);
  setError(null);
  setResult(null);
  ...
}
```

### 4.8 Nav (AC-NA1)

Both `topbar-nav.tsx` and `bottom-nav.tsx` already independently define a
local `NAV` literal with different labels/icons for the same 7 routes — add
one more field to each, rather than introducing a new shared module for a
7-item literal that's already duplicated by design (avoids a premature
abstraction over two call sites that legitimately differ in every other
column):

```ts
// topbar-nav.tsx
const NAV = [
  { href: "/", label: "Dashboard", destination: "dashboard", match: (p: string) => p === "/" },
  { href: "/performance", label: "Performance", destination: "performance", match: (p: string) => p.startsWith("/performance") },
  { href: "/positions", label: "Positions", destination: "positions", match: (p: string) => p.startsWith("/positions") },
  { href: "/crypto", label: "Crypto", destination: "crypto", match: (p: string) => p.startsWith("/crypto") },
  { href: "/dividends", label: "Dividends", destination: "dividends", match: (p: string) => p.startsWith("/dividends") },
  { href: `/tax/${currentYear}`, label: "Tax", destination: "tax", match: (p: string) => p.startsWith("/tax") },
  { href: "/upload", label: "Upload", destination: "upload", match: (p: string) => p.startsWith("/upload") },
] as const;
```

```tsx
<Link
  key={n.href}
  href={n.href as never}
  onClick={() => trackNavLinkClicked(n.destination)} // <-- new
  className="..."
>
  {n.label}
</Link>
```

Same `destination` field + `onClick` added to `bottom-nav.tsx`'s own `NAV`
literal (its `label`/`Icon` columns stay untouched).

### 4.9 Onboarding (AC-ON1..ON4) — `welcome-tour.tsx`

This is the one file needing an actual (behavior-preserving) refactor, not
just an inserted call, because `finish()` currently routes through
`dismiss()` — wiring AC-ON3/AC-ON4 onto the *current* call graph would fire
`onboarding_tour_dismissed` on every completion too, which the AC doc's
correction explicitly rules out ("dismiss() (3 exit paths) and finish() (1
completion path) are the two real branches"). Split the shared "close the
modal" mechanics out of `dismiss()` into a private helper both branches call,
so exactly one of the two events fires per exit:

```ts
import {
  trackOnboardingTourStarted, trackOnboardingPlatformToggled,
  trackOnboardingTourDismissed, trackOnboardingTourCompleted,
} from "@/lib/analytics-events";

type DismissVia = "close_button" | "skip_button" | "escape_key";

// Shared state-teardown only — no tracking here. Both dismiss() and
// finish() call this; each fires its own, mutually-exclusive event first.
const closeTourState = useCallback(() => {
  if (typeof window !== "undefined") window.localStorage.setItem(DISMISS_KEY, "1");
  setOpen(false);
  onClose?.();
}, [onClose]);

const dismiss = useCallback((via: DismissVia) => {
  trackOnboardingTourDismissed(via); // <-- new, AC-ON3
  closeTourState();
}, [closeTourState]);

const finish = useCallback(() => {
  const nextAction: "upload" | "settings" | "explore" =
    selected.has("ibkr") || selected.has("freedom") ? "upload"
    : selected.has("coinbase") ? "settings"
    : "explore";
  trackOnboardingTourCompleted(nextAction); // <-- new, AC-ON4 — same branching as finishCtaLabel()
  closeTourState();
  if (nextAction === "upload") router.push("/upload");
  else if (nextAction === "settings") router.push("/settings");
}, [closeTourState, router, selected]);

const toggle = useCallback((p: Platform) => {
  trackOnboardingPlatformToggled(p); // <-- new, AC-ON2 — fires once per click regardless of on/off direction, matching the AC's explicit "optional, not required" note on adding an `on` flag
  setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(p)) next.delete(p); else next.add(p);
    return next;
  });
}, []);
```

Call sites of `dismiss` all need to pass `via` now (three, matching AC-ON3's
three exit paths exactly):

```tsx
// X button
<button type="button" onClick={() => dismiss("close_button")} aria-label="Close tour"> ... </button>

// "skip tour" button
<button type="button" onClick={() => dismiss("skip_button")}> skip tour </button>
```

```ts
// Escape handler
useEffect(() => {
  if (!open) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape") dismiss("escape_key");
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [open, dismiss]);
```

AC-ON1, in the existing auto-open effect — both branches already run
exactly once per real "the tour opened" occurrence (the `forceOpen` branch
because `TourHost` remounts `WelcomeTour` with `key={openCount}` on every
`TourTrigger` click, per `tour-host.tsx` — confirmed, this is why a fresh
`useEffect` run per click is already guaranteed, no extra dedup needed):

```ts
useEffect(() => {
  if (forceOpen) {
    setOpen(true);
    setStepIdx(0);
    trackOnboardingTourStarted("manual"); // <-- new
    return;
  }
  if (!shouldShow) return;
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
  setOpen(true);
  trackOnboardingTourStarted("auto"); // <-- new
}, [forceOpen, shouldShow]);
```

`platform-card.tsx` needs **no change** — it only calls the `onToggle` prop
it's given; the tracking lives in `welcome-tour.tsx`'s `toggle()`, which is
the single funnel `SelectorCard` already wires all three `PlatformCard`
instances through.

## 5. Traceability

| AC | File(s) | §  |
|---|---|---|
| AC-G1..G6 | `analytics-events.ts` | §2 |
| AC-UP1, AC-UP2 | `upload-dropzone.tsx` | §4.1 |
| AC-AU1..AU6 | `auth-card.tsx` | §4.2 |
| AC-TX1 | `tax-year-selector.tsx` | §4.3 |
| AC-TX2 | `loss-harvest-panel.tsx` | §4.4 |
| AC-TX3 | `tax-export-link.tsx` (new), `tax-client.tsx`, `tax/[year]/anlage-so/page.tsx` | §4.5 |
| AC-PO1 | `positions-sort.tsx` | §4.6 |
| AC-PO2 | `sector-filter.tsx`, `analytics-events.ts` §2.3 | §4.6 |
| AC-PO3 | `instrument-source-card.tsx`, `analytics-events.ts` §2.4 | §4.6 |
| AC-PO4 | `pnl-mode.tsx` | §4.6 |
| AC-PO5 | `dividends-table.tsx` | §4.6 |
| AC-PO6 | `range-picker.tsx` | §4.6 |
| AC-SE1 | `reset-broker-button.tsx`, `settings/page.tsx` | §4.7 |
| AC-SE2..SE4 | `crypto-accounts-manager.tsx` | §4.7 |
| AC-SE5, AC-SE6 | `members-manager.tsx` | §4.7 |
| AC-SE7 | `tax-income-row.tsx` | §4.7 |
| AC-SE8 | `backfill-fx-button.tsx` | §4.7 |
| AC-SE9 | `refresh-quotes-button.tsx` | §4.7 |
| AC-NA1 | `topbar-nav.tsx`, `bottom-nav.tsx` | §4.8 |
| AC-ON1..ON4 | `welcome-tour.tsx` | §4.9 |

## 6. GDPR / `gdpr-compliance` notes

- **Data minimization (§47 BDSG):** the only two properties in the whole
  taxonomy with any risk of unbounded/free-text content are `sector`
  (clamped to a 12-value allow-list at the analytics boundary, §2.3 — the
  *display* layer is unaffected, only the tracked property) and
  `sourceDomain` (derived client-side from a hostname match against a fixed
  5-value list, never the raw URL, §2.4). Every other property in every one
  of the 24 events is either a closed enum, a small integer count, or a
  4-digit calendar year — never an amount, ISIN/symbol, email, or free-text
  field, matching AC-G2 exactly.
- **Least privilege / narrow interfaces (`software-architecture`):** the
  named-function-per-event shape (§2.1) is the enforcement mechanism, not a
  documentation convention — a reviewer only needs to confirm no file
  outside `analytics-events.ts` imports `track` from `@vercel/analytics`
  directly (§2.5's closing note) to know the whole payload allow-list
  contract holds.
- **Fail-open, not fail-closed, on tracking errors (AC-G6):** `send()`'s
  `try/catch` (§2.1) ensures an ad-blocker, offline state, or a future
  `@vercel/analytics` runtime error can never regress upload, sign-in,
  export, or any other real app functionality — analytics is strictly
  additive.
- No new PII field, table, or column is introduced anywhere in this change
  — it is entirely client-side instrumentation calling a third-party
  (Vercel-hosted, first-party-context) collection endpoint with the
  bounded payloads above.

## 7. Build sequence for `developer` (TDD-style)

1. `pnpm add @vercel/analytics`; verify the Suspense question (§1) against
   the installed source; wire `<Analytics />` into `src/app/layout.tsx`.
2. `src/lib/analytics-events.ts` (§2) — this is the highest-leverage file to
   get right first. Unit-test each `track*` function against a mocked
   `@vercel/analytics` `track` (module mock), asserting: (a) the exact event
   name string, (b) the exact property object (or no second argument for
   no-property events), (c) `send()` swallows a thrown error from the mock
   without propagating (AC-G6). Also unit-test `toUploadBroker`,
   `sanitizeSectorForAnalytics`, and `classifyInstrumentLinkSourceDomain` in
   isolation (pure functions, easy table-driven tests) — suggested location
   `tests/lib/analytics-events.test.ts`, mirroring this repo's existing
   `tests/lib/<name>.test.ts` convention.
3. `tax-export-link.tsx` (new, §4.5) — small enough to TDD directly against
   its rendered `onClick` behavior.
4. Wire the remaining 20 call sites per §4.1–§4.9, file by file. Each is an
   isolated, low-risk diff (an added function call, occasionally one new
   prop) — no shared state between them, so they can land in any order and
   be reviewed/tested incrementally rather than as one large diff.
5. `welcome-tour.tsx` (§4.9) last among the UI wiring — it's the one file
   with an actual refactor (`dismiss`/`finish`/`closeTourState` split), so
   give it its own focused test pass confirming: dismissing via all three
   paths fires `onboarding_tour_dismissed` with the right `via` and never
   fires `onboarding_tour_completed`; finishing fires
   `onboarding_tour_completed` with the right `nextAction` and never fires
   `onboarding_tour_dismissed`; both still perform the same localStorage/
   routing side effects as before the refactor (behavior-preserving check).
6. Full pre-push gate (`pnpm typecheck && pnpm lint && pnpm test && pnpm
   build`) before handoff to `code-reviewer`.

## 8. Open items explicitly deferred (not gaps — flagged, matching AC doc's own posture)

- `instrument_link_result` follow-up event (§4.6) — not implemented.
- OAuth (`handleOAuth`) tracking, `verify-email`/`reset-password` page
  tracking — not implemented, per AC doc's own recommendation.
- `on: boolean` direction on `onboarding_platform_toggled` — not added; AC
  doc marks it optional and the current toggle semantics (fire once per
  click) are sufficient signal for "did the user interact with this
  platform card."
- `result` property on `settings_fx_backfill_clicked` /
  `settings_quotes_refresh_clicked` — not added; AC doc marks it optional
  and these fire on click/attempt by design, not on completion.
