import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Module mock of the single `@vercel/analytics` boundary this file wraps.
// AC-G5's whole point is that `analytics-events.ts` is the only place that
// ever imports `track` from `@vercel/analytics` — so every assertion below
// goes through this one mock rather than reaching into the real SDK.
const mockTrack = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({
  track: mockTrack,
}));

// Imported after the mock is registered (hoisted by vi.mock, but keep the
// import here for clarity — vitest hoists vi.mock calls above imports).
import {
  classifyInstrumentLinkSourceDomain,
  sanitizeSectorForAnalytics,
  toUploadBroker,
  trackDividendsExportClicked,
  trackInstrumentLinkSubmitted,
  trackLossHarvestActionTaken,
  trackNavLinkClicked,
  trackOnboardingPlatformToggled,
  trackOnboardingTourCompleted,
  trackOnboardingTourDismissed,
  trackOnboardingTourStarted,
  trackPerformanceRangeChanged,
  trackPositionsPnlModeChanged,
  trackPositionsSectorFiltered,
  trackPositionsSortChanged,
  trackSettingsBrokerResetConfirmed,
  trackSettingsCoinbaseConnected,
  trackSettingsCoinbaseDisconnected,
  trackSettingsCoinbaseSyncClicked,
  trackSettingsFxBackfillClicked,
  trackSettingsMemberAdded,
  trackSettingsMemberRevoked,
  trackSettingsQuotesRefreshClicked,
  trackSettingsTaxIncomeSaved,
  trackSignInFailed,
  trackSignInSubmitted,
  trackSignInSucceeded,
  trackSignUpAccepted,
  trackSignUpFailed,
  trackSignUpSubmitted,
  trackTaxExportClicked,
  trackTaxYearChanged,
  trackUploadFileIngested,
  trackUploadFilesSelected,
} from "@/lib/analytics-events";

beforeEach(() => {
  mockTrack.mockReset();
});

describe("upload events (AC-UP1/UP2)", () => {
  it("trackUploadFilesSelected sends the exact event name and count property", () => {
    trackUploadFilesSelected(3);
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("upload_files_selected", { count: 3 });
  });

  it("trackUploadFileIngested sends broker + result, no other keys", () => {
    trackUploadFileIngested("ibkr", "success");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("upload_file_ingested", {
      broker: "ibkr",
      result: "success",
    });
  });

  it("trackUploadFileIngested covers the error result", () => {
    trackUploadFileIngested("revolut", "error");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("upload_file_ingested", {
      broker: "revolut",
      result: "error",
    });
  });
});

describe("auth events (AC-AU1..AU6)", () => {
  it("trackSignInSubmitted", () => {
    trackSignInSubmitted();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("sign_in_submitted", { mode: "sign-in" });
  });

  it("trackSignInSucceeded", () => {
    trackSignInSucceeded();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("sign_in_succeeded", { mode: "sign-in" });
  });

  it("trackSignInFailed carries the reason enum", () => {
    trackSignInFailed("email_not_verified");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("sign_in_failed", {
      mode: "sign-in",
      reason: "email_not_verified",
    });
  });

  it("trackSignInFailed covers invalid_credentials", () => {
    trackSignInFailed("invalid_credentials");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("sign_in_failed", {
      mode: "sign-in",
      reason: "invalid_credentials",
    });
  });

  it("trackSignUpSubmitted", () => {
    trackSignUpSubmitted();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("sign_up_submitted", { mode: "sign-up" });
  });

  it("trackSignUpAccepted", () => {
    trackSignUpAccepted();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("sign_up_accepted", { mode: "sign-up" });
  });

  it("trackSignUpFailed", () => {
    trackSignUpFailed();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("sign_up_failed", { mode: "sign-up" });
  });
});

describe("tax events (AC-TX1..TX3)", () => {
  it("trackTaxYearChanged carries the year", () => {
    trackTaxYearChanged(2024);
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("tax_year_changed", { year: 2024 });
  });

  it.each(["auto_pick", "clear", "adjust_qty"] as const)(
    "trackLossHarvestActionTaken(%s)",
    (action) => {
      trackLossHarvestActionTaken(action);
      expect(mockTrack).toHaveBeenCalledOnce();
      expect(mockTrack).toHaveBeenCalledWith("loss_harvest_action_taken", { action });
    },
  );

  it("trackTaxExportClicked carries form + format, no mode", () => {
    trackTaxExportClicked("anlage_kap", "pdf");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("tax_export_clicked", {
      form: "anlage_kap",
      format: "pdf",
    });
  });

  it("trackTaxExportClicked covers anlage_so/csv", () => {
    trackTaxExportClicked("anlage_so", "csv");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("tax_export_clicked", {
      form: "anlage_so",
      format: "csv",
    });
  });
});

describe("positions/dashboard events (AC-PO1..PO6)", () => {
  it("trackPositionsSortChanged", () => {
    trackPositionsSortChanged("gain");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("positions_sort_changed", { sort: "gain" });
  });

  it("trackPositionsSectorFiltered passes a known sector through unchanged", () => {
    trackPositionsSectorFiltered("Tech");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("positions_sector_filtered", {
      sector: "Tech",
    });
  });

  it("trackPositionsSectorFiltered passes 'all' through unchanged", () => {
    trackPositionsSectorFiltered("all");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("positions_sector_filtered", {
      sector: "all",
    });
  });

  it("trackPositionsSectorFiltered clamps an unrecognized sector to 'Other' (AC-PO2)", () => {
    trackPositionsSectorFiltered("Some Obscure FMP Label");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("positions_sector_filtered", {
      sector: "Other",
    });
  });

  it("trackInstrumentLinkSubmitted carries only the classified sourceDomain", () => {
    trackInstrumentLinkSubmitted("yahoo");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("instrument_link_submitted", {
      sourceDomain: "yahoo",
    });
  });

  it("trackPositionsPnlModeChanged", () => {
    trackPositionsPnlModeChanged("broker");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("positions_pnl_mode_changed", {
      mode: "broker",
    });
  });

  it("trackDividendsExportClicked fires with no properties", () => {
    trackDividendsExportClicked();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("dividends_export_clicked");
  });

  it("trackPerformanceRangeChanged", () => {
    trackPerformanceRangeChanged("YTD");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("performance_range_changed", {
      range: "YTD",
    });
  });
});

describe("settings events (AC-SE1..SE9)", () => {
  it("trackSettingsBrokerResetConfirmed carries the mapped broker enum", () => {
    trackSettingsBrokerResetConfirmed("freedom");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("settings_broker_reset_confirmed", {
      broker: "freedom",
    });
  });

  it("trackSettingsCoinbaseConnected fires with no properties, no PII", () => {
    trackSettingsCoinbaseConnected();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("settings_coinbase_connected");
  });

  it("trackSettingsCoinbaseSyncClicked fires with no properties", () => {
    trackSettingsCoinbaseSyncClicked();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("settings_coinbase_sync_clicked");
  });

  it("trackSettingsCoinbaseDisconnected fires with no properties", () => {
    trackSettingsCoinbaseDisconnected();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("settings_coinbase_disconnected");
  });

  it("trackSettingsMemberAdded fires with no properties (no email/note)", () => {
    trackSettingsMemberAdded();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("settings_member_added");
  });

  it("trackSettingsMemberRevoked fires with no properties", () => {
    trackSettingsMemberRevoked();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("settings_member_revoked");
  });

  it("trackSettingsTaxIncomeSaved fires with no properties (never the income figure)", () => {
    trackSettingsTaxIncomeSaved();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("settings_tax_income_saved");
  });

  it("trackSettingsFxBackfillClicked fires with no properties", () => {
    trackSettingsFxBackfillClicked();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("settings_fx_backfill_clicked");
  });

  it("trackSettingsQuotesRefreshClicked fires with no properties", () => {
    trackSettingsQuotesRefreshClicked();
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("settings_quotes_refresh_clicked");
  });
});

describe("nav/onboarding events (AC-NA1, AC-ON1..ON4)", () => {
  it("trackNavLinkClicked carries the destination", () => {
    trackNavLinkClicked("dividends");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("nav_link_clicked", {
      destination: "dividends",
    });
  });

  it("trackOnboardingTourStarted covers the auto trigger", () => {
    trackOnboardingTourStarted("auto");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("onboarding_tour_started", {
      trigger: "auto",
    });
  });

  it("trackOnboardingTourStarted covers the manual trigger", () => {
    trackOnboardingTourStarted("manual");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("onboarding_tour_started", {
      trigger: "manual",
    });
  });

  it("trackOnboardingPlatformToggled", () => {
    trackOnboardingPlatformToggled("coinbase");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("onboarding_platform_toggled", {
      platform: "coinbase",
    });
  });

  it("trackOnboardingTourDismissed carries the via enum", () => {
    trackOnboardingTourDismissed("escape_key");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("onboarding_tour_dismissed", {
      via: "escape_key",
    });
  });

  it("trackOnboardingTourCompleted carries the nextAction enum", () => {
    trackOnboardingTourCompleted("upload");
    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("onboarding_tour_completed", {
      nextAction: "upload",
    });
  });
});

describe("send() fail-open behaviour (AC-G6)", () => {
  afterEach(() => {
    mockTrack.mockReset();
  });

  it("swallows a thrown error from the underlying track() call without propagating", () => {
    mockTrack.mockImplementationOnce(() => {
      throw new Error("blocked by ad-blocker");
    });
    expect(() => trackSignInSubmitted()).not.toThrow();
  });

  it("swallows a thrown error even for property-carrying events", () => {
    mockTrack.mockImplementationOnce(() => {
      throw new Error("network offline");
    });
    expect(() => trackUploadFilesSelected(1)).not.toThrow();
  });
});

describe("toUploadBroker (AC-G3)", () => {
  it("maps INTERACTIVE_BROKERS to ibkr", () => {
    expect(toUploadBroker("INTERACTIVE_BROKERS")).toBe("ibkr");
  });

  it("maps FREEDOM_FINANCE to freedom", () => {
    expect(toUploadBroker("FREEDOM_FINANCE")).toBe("freedom");
  });

  it("maps REVOLUT to revolut", () => {
    expect(toUploadBroker("REVOLUT")).toBe("revolut");
  });

  it("maps COINBASE to null (no statement-upload path exists for it)", () => {
    expect(toUploadBroker("COINBASE")).toBeNull();
  });
});

describe("sanitizeSectorForAnalytics (AC-PO2)", () => {
  it("passes 'all' through unchanged (SectorFilter's own sentinel)", () => {
    expect(sanitizeSectorForAnalytics("all")).toBe("all");
  });

  it.each([
    "Tech", "Financials", "Healthcare", "Consumer", "Energy", "Industrials",
    "Materials", "Real Estate", "Communication", "Utilities", "ETF", "Other",
  ])("passes a known canonical sector through unchanged: %s", (sector) => {
    expect(sanitizeSectorForAnalytics(sector)).toBe(sector);
  });

  it("clamps any unrecognized, provider-sourced label to 'Other'", () => {
    expect(sanitizeSectorForAnalytics("Some Weird FMP Sector")).toBe("Other");
  });
});

describe("classifyInstrumentLinkSourceDomain (AC-PO3)", () => {
  it("classifies a Yahoo Finance URL", () => {
    expect(classifyInstrumentLinkSourceDomain("https://finance.yahoo.com/quote/AAPL")).toBe("yahoo");
  });

  it("classifies a justETF URL, stripping www.", () => {
    expect(classifyInstrumentLinkSourceDomain("https://www.justetf.com/en/etf-profile.html?isin=X")).toBe(
      "justetf",
    );
  });

  it("classifies a Google Finance URL", () => {
    expect(classifyInstrumentLinkSourceDomain("https://www.google.com/finance/quote/AAPL:NASDAQ")).toBe(
      "google",
    );
  });

  it("classifies a Stockopedia URL", () => {
    expect(classifyInstrumentLinkSourceDomain("https://www.stockopedia.com/share-prices/foo")).toBe(
      "stockopedia",
    );
  });

  it("classifies anything else as other", () => {
    expect(classifyInstrumentLinkSourceDomain("https://example.com/some/instrument")).toBe("other");
  });

  it("classifies an unparsable string as other rather than throwing", () => {
    expect(classifyInstrumentLinkSourceDomain("not a url")).toBe("other");
  });

  it("never leaks the raw path/query in its return value", () => {
    const result = classifyInstrumentLinkSourceDomain(
      "https://finance.yahoo.com/quote/SECRET-HOLDING-ISIN?query=leak",
    );
    expect(result).toBe("yahoo");
    expect(result).not.toContain("SECRET-HOLDING-ISIN");
  });
});
