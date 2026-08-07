# Vercel Web Analytics — Custom Event Tracking — Acceptance Criteria

Status: implemented and reviewed. See
[design spec](2026-08-07-analytics-events-design.md) for the architecture
and [changelog](../../CHANGELOG.md) for the shipped-change record.

## User story

As the team running Folio (a German investment-tax reporting app), I want
lightweight custom-event usage analytics on key user actions across Upload,
Auth, Tax, Positions/Dashboard, Settings, and Nav/Onboarding, so we can see
which features get used — **without** ever capturing amounts, identities, or
anything that could re-identify a user's specific holdings or income.

## Scope

**In scope:**
- Installing `@vercel/analytics` and mounting `<Analytics />` once in the
  root layout.
- A new `src/lib/analytics-events.ts` module (deliberately distinct from the
  existing, unrelated `src/lib/analytics/` portfolio-calculation module).
- The event catalogue below — each event tied to a verified, currently-live
  interaction point in the codebase (verification notes are inline).

**Out of scope:**
- Dashboards, alerting, or any consumption of the collected data.
- Any change to app functionality, UI copy, or business logic.
- Vercel Speed Insights or server-side/audit logging.
- Automatic page-view tracking (Vercel Analytics does this on its own;
  don't duplicate it with custom events).

## Global rules (apply to every event below)

- **AC-G1** Given any tracked interaction fires, when the event is sent,
  then the payload contains only the event name and (if applicable)
  properties drawn from that specific event's allow-list below — never ad
  hoc extra keys.
- **AC-G2** Given the app handles German tax/financial PII, when any event
  is defined or implemented, then it must **never** include: monetary
  amounts or currency values, email addresses, account numbers,
  ISIN/ticker/symbol values tied to a specific user's holdings, free-text
  user input (pasted URLs, notes, labels, file names), or any other
  identifying string. Every event below has been checked against this rule.
- **AC-G3** Given a broker identifier appears in an event's payload, when
  it's populated, then it must use the app's existing normalized broker
  enum for that context, not a raw display label. Two distinct enums exist
  and must not be conflated:
  - **Statement-upload / broker-account enum:** `"ibkr" | "freedom" |
    "revolut"` — maps from `INTERACTIVE_BROKERS` / `FREEDOM_FINANCE` /
    `REVOLUT` (verified: `src/lib/brokers/types.ts`). Coinbase never appears
    here — it has no statement-upload path (see AC-SE2).
  - **Positions/Dividends broker-filter enum:** `"all" | "ff" | "ibkr"`
    (verified: `src/components/pulse/broker-filter.tsx`).
  This corrects the input taxonomy, which assumed a single `"ibkr" |
  "freedom" | "coinbase"` set for upload events — `"coinbase"` never occurs
  there and `"revolut"` was missing.
- **AC-G4 (base setup)** Given the app builds, when `@vercel/analytics` is
  added (`pnpm add @vercel/analytics`), then `<Analytics />` is mounted
  exactly once inside `<body>` in `src/app/layout.tsx` (verified: current
  file is a plain `<html><body>{children}</body></html>` shell with no
  existing Suspense boundary or analytics) so every route — including
  `/sign-in`, `/verify-email`, `/reset-password`, which sit outside the
  `(app)` route group — is covered.
- **AC-G5** Given the new tracking module, when it's created, then it lives
  at `src/lib/analytics-events.ts` and exports one typed function per event
  (or a single typed `track(event, props)` wrapper with a discriminated
  union) so call sites cannot pass arbitrary/misspelled property keys.
- **AC-G6** Given a tracked action, when the analytics call fails, throws,
  or is blocked (ad-blocker, offline, etc.), then the app's own
  functionality (upload, sign-in, tax export, settings changes, …) is
  completely unaffected — tracking must never throw into or block the
  calling code path.

## 1. Upload — `src/components/pulse/upload-dropzone.tsx` (mounted at `/upload`)

Verified live via `src/app/(app)/upload/page.tsx`.
`src/components/imports/import-form.tsx` is **dead code** — grepped for
usages; nothing imports it — and is explicitly out of scope.

- **AC-UP1 (files selected)** Given a user is on `/upload`, when they drop
  or pick one or more files (dropzone `onDrop` or file `<input
  onChange>`, i.e. `addFiles()` runs), then an `upload_files_selected`
  event fires once per batch with `{ count: <number> }`.
  - Allowed: `count`.
  - **Correction to input taxonomy:** drop the optional `broker` property
    from this event. Broker isn't known until per-file parsing completes
    (`parsed.broker`), and one batch can legitimately mix files from
    different brokers, so no single value would be accurate at
    selection time.
- **AC-UP2 (per-file ingest outcome)** Given a queued file reaches a
  terminal state (`processItem()` → `"done"` / `"skipped-duplicate"` /
  `"failed"`), when that outcome is known, then an `upload_file_ingested`
  event fires once per file with `{ broker: "ibkr"|"freedom"|"revolut",
  result: "success"|"error" }` — `"success"` covers both `"done"` and
  `"skipped-duplicate"`; `"error"` covers `"failed"`.
  - Allowed: `broker`, `result`.
  - Forbidden: file name, `item.error` (a raw exception message — may echo
    parsed file content, never send it), event/insert/duplicate counts,
    tax year, account number.
- **Flagged as over-tracking risk (confirm with architect):** "retry
  failed" / "clear batch" queue-management clicks — not new distinct
  outcomes on top of AC-UP2, recommend leaving untracked.

## 2. Auth — `auth-card.tsx`, `auth-modal-trigger.tsx`, `verify-email/page.tsx`, `reset-password/page.tsx`

Verified against the current (2026-08-06) email-verification-gate
behavior: sign-in on an unverified account hard-rejects, it does not nudge.

- **AC-AU1** Given the sign-in tab, when the form is submitted
  (`handleSignIn` runs), then `sign_in_submitted` fires with `{ mode:
  "sign-in" }`.
- **AC-AU2** Given a submitted sign-in, when `authClient.signIn.email`
  returns no error (about to redirect to `/`), then `sign_in_succeeded`
  fires with `{ mode: "sign-in" }`.
- **AC-AU3** Given a submitted sign-in, when it errors, then
  `sign_in_failed` fires with `{ mode: "sign-in", reason:
  "invalid_credentials" | "email_not_verified" }` —
  `"email_not_verified"` is `isEmailNotVerifiedSignInError`'s branch;
  everything else is `"invalid_credentials"`.
- **AC-AU4** Given the sign-up tab, when the form is submitted and passes
  the client-side password-length check (`handleSignUp` calls
  `authClient.signUp.email`), then `sign_up_submitted` fires with `{ mode:
  "sign-up" }`.
- **AC-AU5** Given a submitted sign-up, when `authClient.signUp.email`
  returns no error (wait-state shown), then `sign_up_accepted` fires with
  `{ mode: "sign-up" }`. **Naming note:** per the anti-enumeration design
  (`2026-08-06-email-verification-gate-design.md` §5) this fires
  identically for a genuine and a duplicate-email sign-up — it means
  "request accepted," not "new account created." Do not call it
  `sign_up_completed`.
- **AC-AU6** Given a submitted sign-up, when it errors (e.g. password too
  short), then `sign_up_failed` fires with `{ mode: "sign-up" }`.
- **Ambiguity flagged for architect — true sign-up completion:** actual
  verification only happens on `verify-email/page.tsx`, which currently
  cannot distinguish a fresh sign-up from a blocked-sign-in resend (both
  build the same `callbackURL` shape via `buildVerifyEmailCallbackURL`, no
  `mode` param). Two options: (a) treat AC-AU5 as the practical proxy for
  "sign-up completed" and don't instrument `verify-email/page.tsx` at all
  — **recommended**, keeps this change non-invasive; or (b) add a `mode`
  query param to the callback URL construction so the page can fire a true
  `email_verified { mode }` event. If (b) is chosen, route it through
  `tax-advisor`/security review given how carefully the anti-enumeration
  invariants in that flow were built — don't let an analytics change touch
  that contract casually.
- **Ambiguity flagged — OAuth:** the Google/GitHub buttons in `AuthCard`
  render identically regardless of the active tab, and `handleOAuth` has
  no sign-in/sign-up distinction; the call also redirects away before
  success/failure is observable client-side. Recommend leaving OAuth
  untracked for this pass (option b — a provider-only `oauth_initiated {
  provider }` with no `mode` — is available if the architect wants it, but
  it's not in the original taxonomy).
- **Not tracked (flagged as a possible gap, out of scope unless
  requested):** the forgot-password / reset-password flow.

## 3. Tax module

Verified live: `src/components/pulse/tax-year-selector.tsx`,
`loss-harvest-panel.tsx`, `tax-client.tsx` (rendered from
`src/app/(app)/tax/[year]/page.tsx`), `src/app/(app)/tax/[year]/anlage-so/page.tsx`.

- **AC-TX1 (tax year changed)** Given the year-tab strip
  (`TaxYearSelector`, only rendered with 2+ years available), when the
  user clicks a year tab, then `tax_year_changed` fires with `{ year:
  <number> }`. A tax year is a calendar year, not PII.
- **AC-TX2 (loss-harvest action taken)** Given `/tax/[year]/loss-harvest`,
  when the user clicks "Auto-pick optimum" (`applyOptimum`), "Clear"
  (`clearAll`), or a per-row stepper/quick-fill (`setQty`), then
  `loss_harvest_action_taken` fires with `{ action: "auto_pick" | "clear" |
  "adjust_qty" }`.
  - Allowed: `action` only.
  - Forbidden: symbol, broker, quantity, loss amount, bucket
    (aktien/sonstige) — all position-identifying or monetary; do not track
    at row granularity.
- **AC-TX3 (export triggered)** Given the "Export PDF" / "CSV" links on
  `/tax/[year]` (Anlage KAP) or `/tax/[year]/anlage-so` (Anlage SO), when
  the user clicks one, then `tax_export_clicked` fires with `{ form:
  "anlage_kap" | "anlage_so", format: "pdf" | "csv" }`.
  - **Correction to input taxonomy:** there is no `mode: "broker"|"net"`
    toggle anywhere in the export flow. That enum belongs to
    `src/components/pulse/pnl-mode.tsx`, an unrelated Positions-page P/L
    display toggle (see AC-PO4). Drop `mode` from this event.
- **Not tracked (flagged):** "loss-harvest panel opened" from the input
  taxonomy — there's no distinct open action; the panel IS the
  `/tax/[year]/loss-harvest` page, so this would just duplicate Vercel's
  automatic page-view tracking.

## 4. Positions / Dashboard

Verified live: `positions-sort.tsx`, `sector-filter.tsx`,
`instrument-source-card.tsx`, `dividends-table.tsx` (export link),
`range-picker.tsx`, `pnl-mode.tsx`.

- **AC-PO1 (sort changed)** Given the Positions sort control, when the
  user clicks Value/Gain/A–Z, then `positions_sort_changed` fires with `{
  sort: "value" | "gain" | "az" }` (matches `PositionSort`,
  `src/lib/analytics/positions-view.ts`).
- **AC-PO2 (sector filtered)** Given the Positions sector pills, when the
  user picks a sector or "All sectors", then `positions_sector_filtered`
  fires with `{ sector: <string> }`. **Flag for architect:** confirm
  sector values are drawn from the app's own bounded classification list
  server-side before treating this as safe free text; if sector strings
  can ever originate from unvetted third-party metadata, cap to a known
  allow-list or drop the property.
- **AC-PO3 (instrument link submitted)** Given the position-detail panel's
  "Data source" card with no resolved metadata (`InstrumentSourceCard`,
  `meta === null`, or its "Change" form), when the user submits a pasted
  link, then `instrument_link_submitted` fires with `{ sourceDomain:
  "yahoo" | "justetf" | "google" | "stockopedia" | "other" }`, where
  `sourceDomain` is derived **client-side** from the pasted URL's hostname
  against a fixed known-provider list.
  - Allowed: `sourceDomain` (bounded enum only).
  - Forbidden: the raw URL/path/query string, `symbol`, `isin` (both
    identify a specific user's holding), any part of the fetch response.
  - Optional, architect's call (not in original taxonomy): a follow-up
    `instrument_link_result { result: "ok"|"not_found"|"error" }`, still
    without symbol/isin.
- **AC-PO4 (P/L mode toggled) — new, not in original taxonomy** Given the
  `PnlModeToggle` on the Positions page, when the user switches
  Broker/Net, then `positions_pnl_mode_changed` fires with `{ mode:
  "broker" | "net" }`. Added because this is the actual, verified home of
  the `"broker"|"net"` enum the input taxonomy had misattributed to tax
  export (see AC-TX3's correction). Architect may drop if genuinely out of
  scope, but flagging since the taxonomy clearly intended to track this
  distinction somewhere.
- **AC-PO5 (dividends export clicked)** Given `/dividends`, when the user
  clicks "export csv →" (the `exportHref` anchor in `DividendsTable`), then
  `dividends_export_clicked` fires with no properties.
- **AC-PO6 (performance range changed)** Given `/performance`, when the
  user picks a range pill (`RangePicker`), then
  `performance_range_changed` fires with `{ range: "1M"|"3M"|"6M"|"YTD"|
  "1Y"|"2Y"|"ALL" }`.

## 5. Settings

Verified live, all rendered from `src/app/(app)/settings/page.tsx`:
`reset-broker-button.tsx`, `crypto-accounts-manager.tsx`,
`members-manager.tsx`, `tax-income-row.tsx`, `backfill-fx-button.tsx`,
`refresh-quotes-button.tsx`.

- **AC-SE1 (broker reset confirmed)** Given the reset-broker confirm
  dialog, when the user clicks "Reset data" and the `/api/imports/reset`
  call succeeds, then `settings_broker_reset_confirmed` fires with `{
  broker: "ibkr"|"freedom"|"revolut" }` — derived from the broker
  account's own broker id, **not** from the free-text `brokerLabel` prop.
- **AC-SE2 (Coinbase connected)** Given the Coinbase connect form, when
  `connect()`'s POST to `/api/crypto/coinbase/connect` succeeds, then
  `settings_coinbase_connected` fires with no properties.
  - Forbidden: the pasted CDP key/secret blob, label, `coinbaseUser`
    email/id — all secrets/PII.
- **AC-SE3 (Coinbase sync clicked)** Given a connected Coinbase row, when
  the user clicks "Sync now" (`sync()` invoked — track on click/attempt,
  not just success), then `settings_coinbase_sync_clicked` fires with no
  properties.
- **AC-SE4 (Coinbase disconnected)** Given a connected Coinbase row, when
  `disconnect()`'s DELETE succeeds, then `settings_coinbase_disconnected`
  fires with no properties.
- **AC-SE5 (member added)** Given the admin-only Members panel, when
  `add()`'s POST to `/api/admin/allowlist` succeeds, then
  `settings_member_added` fires with no properties.
  - Forbidden: invited email, note text.
- **AC-SE6 (member revoked)** Given the Members panel, when `remove()`'s
  DELETE succeeds, then `settings_member_revoked` fires with no
  properties.
- **AC-SE7 (tax income saved)** Given the "Annual taxable income" row,
  when `save()`'s POST to `/api/settings/tax-income` succeeds, then
  `settings_tax_income_saved` fires with no properties.
  - Forbidden: `taxableIncomeEur` — never send this value, not even
    rounded/bucketed. This is a personal income figure.
- **AC-SE8 (FX backfill clicked)** Given the Currency & FX card, when the
  user clicks "Backfill historical FX" (`run()` invoked), then
  `settings_fx_backfill_clicked` fires with no properties.
- **AC-SE9 (quotes refresh clicked)** Given the same card, when the user
  clicks "Refresh quotes" (`run()` invoked), then
  `settings_quotes_refresh_clicked` fires with no properties.
  - AC-SE8/SE9 fire on click/attempt, not on success — low-frequency
    admin/maintenance actions where "did the user reach for this" is the
    interesting signal. Architect may add a `result` property from the
    response if desired; not required.

## 6. Nav / Onboarding

Verified live: `topbar.tsx` + `topbar-nav.tsx` (desktop), `bottom-nav.tsx`
(mobile), `welcome-tour.tsx` + `tour-host.tsx` + `platform-card.tsx`.

- **AC-NA1 (nav link clicked)** Given the topbar (desktop) or bottom nav
  (mobile), when the user clicks a nav item, then `nav_link_clicked` fires
  with `{ destination: "dashboard"|"performance"|"positions"|"crypto"|
  "dividends"|"tax"|"upload" }` — the 7 static routes shared by both
  `TopbarNav` and `BottomNav` (the `/tax/<year>` link normalizes to
  `"tax"`, dropping the year).
- **AC-ON1 (tour started)** Given a first-run user with zero imports, when
  the tour auto-opens, **or** any user clicks the "?" `TourTrigger` in the
  topbar, then `onboarding_tour_started` fires with `{ trigger: "auto" |
  "manual" }`.
- **AC-ON2 (platform toggled)** Given the tour's platform-selector step,
  when the user toggles IBKR/Freedom/Coinbase on or off (`toggle()`), then
  `onboarding_platform_toggled` fires with `{ platform: "ibkr" | "freedom"
  | "coinbase" }` (matches `Platform`, `platform-card.tsx`) — once per
  click regardless of on/off direction (architect may add `on: boolean`
  if direction is wanted; optional).
- **AC-ON3 (tour dismissed)** Given the tour is open, when the user closes
  it without reaching the final step (`dismiss()` via the X button, "skip
  tour" button, or Escape — **not** via `finish()`), then
  `onboarding_tour_dismissed` fires with `{ via: "close_button" |
  "skip_button" | "escape_key" }`.
- **AC-ON4 (tour completed)** Given the tour is on its final ("ready")
  step, when the user clicks the primary CTA (`finish()` invoked), then
  `onboarding_tour_completed` fires with `{ nextAction: "upload" |
  "settings" | "explore" }`, derived from the same branching as
  `finishCtaLabel` (ibkr/freedom selected → `"upload"`; coinbase-only →
  `"settings"`; nothing selected → `"explore"`).
  - **Correction to input taxonomy:** the draft put `exitAction` on
    `onboarding_tour_completed` and left `onboarding_tour_dismissed` bare.
    Per the actual code, `dismiss()` (3 exit paths) and `finish()` (1
    completion path) are the two real branches — "which button" belongs
    on the *dismissed* event (AC-ON3's `via`), and "where do they go next"
    belongs on the *completed* event (AC-ON4's `nextAction`). Implement
    per this corrected mapping, not the literal draft.

## 7. Explicitly out of scope / not tracked

- Forgot-password / reset-password request flow.
- Sign-out (`UserMenu.signOut`).
- `src/components/imports/import-form.tsx` — confirmed dead code, no page
  renders it.
- Upload queue "retry failed" / "clear batch" buttons.
- Any Vercel-automatic page-view tracking.

## Traceability

Each AC ID (AC-G*, AC-UP*, AC-AU*, AC-TX*, AC-PO*, AC-SE*, AC-NA*, AC-ON*)
is the unit the architect designs against, and the unit `code-reviewer` /
`tester` should be able to point a test at.
