import { track } from "@vercel/analytics";

/**
 * Single funnel for every custom Vercel Web Analytics event this app emits.
 *
 * AC-G5: this module is the *only* place that imports `track` from
 * `@vercel/analytics`. Every call site elsewhere in the app imports one of
 * the narrowly-typed `track*` functions below instead of a generic
 * `track(name, props)` escape hatch — so TypeScript structurally prevents
 * call sites from passing arbitrary or misspelled event names/properties
 * (AC-G1).
 *
 * AC-G6: analytics must never break app functionality. `send()` swallows
 * any error thrown by the underlying `track()` call (e.g. an ad-blocker
 * blocking the script, or the browser being offline) — fail open, always.
 */
function send(name: string, properties?: Record<string, string | number | boolean>): void {
  try {
    if (properties === undefined) {
      track(name);
    } else {
      track(name, properties);
    }
  } catch {
    // Fail open: analytics must never break the app.
  }
}

// ---------------------------------------------------------------------------
// Shared enums / mapping + sanitization helpers
// ---------------------------------------------------------------------------

export type UploadBroker = "ibkr" | "freedom" | "revolut";
export type PositionsBrokerFilter = "all" | "ff" | "ibkr";
export type InstrumentLinkSourceDomain = "yahoo" | "justetf" | "google" | "stockopedia" | "other";
export type NavDestination =
  | "dashboard"
  | "performance"
  | "positions"
  | "crypto"
  | "dividends"
  | "tax"
  | "upload";

/**
 * Maps a statement-upload broker enum (as stored on the ledger) to the
 * narrower set of brokers that actually have a statement-upload flow.
 * COINBASE has no statement-upload path (it's a live API sync instead), so
 * it maps to `null` — callers must check for that before tracking.
 */
export function toUploadBroker(
  broker: "INTERACTIVE_BROKERS" | "FREEDOM_FINANCE" | "COINBASE" | "REVOLUT",
): UploadBroker | null {
  switch (broker) {
    case "INTERACTIVE_BROKERS":
      return "ibkr";
    case "FREEDOM_FINANCE":
      return "freedom";
    case "REVOLUT":
      return "revolut";
    case "COINBASE":
      return null;
  }
}

const KNOWN_SECTORS = new Set([
  "Tech",
  "Financials",
  "Healthcare",
  "Consumer",
  "Energy",
  "Industrials",
  "Materials",
  "Real Estate",
  "Communication",
  "Utilities",
  "ETF",
  "Other",
]);

/**
 * Sector labels come from a third-party market-data provider and are
 * effectively unbounded free text. AC-PO2 (data minimization): clamp any
 * unrecognized, provider-sourced label to "Other" before it ever reaches the
 * analytics boundary, so we never leak provider-specific taxonomy drift into
 * event data. "all" is SectorFilter's own sentinel value and always passes
 * through unchanged.
 */
export function sanitizeSectorForAnalytics(sector: string): string {
  if (sector === "all") return "all";
  return KNOWN_SECTORS.has(sector) ? sector : "Other";
}

/**
 * Classifies an instrument-link source URL into a bounded enum of known
 * domains. AC-PO3 (data minimization): never send the raw URL (which may
 * contain an ISIN or other identifying path/query data) to analytics — only
 * the classified domain bucket.
 */
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

// ---------------------------------------------------------------------------
// Upload events (AC-UP1/UP2)
// ---------------------------------------------------------------------------

export function trackUploadFilesSelected(count: number): void {
  send("upload_files_selected", { count });
}

export function trackUploadFileIngested(broker: UploadBroker, result: "success" | "error"): void {
  send("upload_file_ingested", { broker, result });
}

// ---------------------------------------------------------------------------
// Auth events (AC-AU1..AU6)
// ---------------------------------------------------------------------------

export function trackSignInSubmitted(): void {
  send("sign_in_submitted", { mode: "sign-in" });
}

export function trackSignInSucceeded(): void {
  send("sign_in_succeeded", { mode: "sign-in" });
}

export function trackSignInFailed(reason: "email_not_verified" | "invalid_credentials"): void {
  send("sign_in_failed", { mode: "sign-in", reason });
}

export function trackSignUpSubmitted(): void {
  send("sign_up_submitted", { mode: "sign-up" });
}

export function trackSignUpAccepted(): void {
  send("sign_up_accepted", { mode: "sign-up" });
}

export function trackSignUpFailed(): void {
  send("sign_up_failed", { mode: "sign-up" });
}

// ---------------------------------------------------------------------------
// Tax events (AC-TX1..TX3)
// ---------------------------------------------------------------------------

export function trackTaxYearChanged(year: number): void {
  send("tax_year_changed", { year });
}

export function trackLossHarvestActionTaken(action: "auto_pick" | "clear" | "adjust_qty"): void {
  send("loss_harvest_action_taken", { action });
}

export function trackTaxExportClicked(form: "anlage_kap" | "anlage_so", format: "pdf" | "csv"): void {
  send("tax_export_clicked", { form, format });
}

// ---------------------------------------------------------------------------
// Positions/dashboard events (AC-PO1..PO6)
// ---------------------------------------------------------------------------

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

export function trackDividendsExportClicked(): void {
  send("dividends_export_clicked");
}

export function trackPerformanceRangeChanged(
  range: "1M" | "3M" | "6M" | "YTD" | "1Y" | "2Y" | "ALL",
): void {
  send("performance_range_changed", { range });
}

// ---------------------------------------------------------------------------
// Settings events (AC-SE1..SE9)
// ---------------------------------------------------------------------------

export function trackSettingsBrokerResetConfirmed(broker: UploadBroker): void {
  send("settings_broker_reset_confirmed", { broker });
}

export function trackSettingsCoinbaseConnected(): void {
  send("settings_coinbase_connected");
}

export function trackSettingsCoinbaseSyncClicked(): void {
  send("settings_coinbase_sync_clicked");
}

export function trackSettingsCoinbaseDisconnected(): void {
  send("settings_coinbase_disconnected");
}

export function trackSettingsMemberAdded(): void {
  send("settings_member_added");
}

export function trackSettingsMemberRevoked(): void {
  send("settings_member_revoked");
}

export function trackSettingsTaxIncomeSaved(): void {
  send("settings_tax_income_saved");
}

export function trackSettingsFxBackfillClicked(): void {
  send("settings_fx_backfill_clicked");
}

export function trackSettingsQuotesRefreshClicked(): void {
  send("settings_quotes_refresh_clicked");
}

// ---------------------------------------------------------------------------
// Nav/onboarding events (AC-NA1, AC-ON1..ON4)
// ---------------------------------------------------------------------------

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
