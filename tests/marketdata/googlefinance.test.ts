/**
 * Google Finance quote scraper — pure parser.
 *
 * Google Finance (google.com/finance/quote/{TICKER}:{EXCHANGE}) is reachable
 * from our Vercel IP where Yahoo is not, so it's the source for non-US stocks
 * that Yahoo would otherwise price (e.g. Trainline TRN:LON). The main quote is
 * the FIRST "{CURRENCY} {price}" in the page — the stats (prev close, high,
 * low) follow it. GBX (pence) → GBP ÷100.
 */
import { describe, it, expect } from "vitest";
import { parseGoogleFinanceQuote } from "@/lib/marketdata/providers/googlefinance";

const NOW = new Date("2026-07-11T10:00:00Z");
const page = (main: string, ...rest: string[]) =>
  `<div class="gO24Ff">Trainline PLC</div><div class="N6SYTe"><span>${main}</span></div>` +
  rest.map((r) => `<div>${r}</div>`).join("");

describe("parseGoogleFinanceQuote", () => {
  it("reads the main GBX price and converts pence → GBP", () => {
    // 218.00 GBX = £2.18. Stats (prev close etc.) come after and must be ignored.
    expect(parseGoogleFinanceQuote(page("GBX 218.00", "GBX 216.00", "GBX 225.00"), NOW)).toEqual({
      close: "2.18",
      currency: "GBP",
      date: "2026-07-11",
      source: "GOOGLE",
    });
  });

  it("passes a USD price straight through", () => {
    expect(parseGoogleFinanceQuote(page("USD 234.56"), NOW)).toMatchObject({ close: "234.56", currency: "USD" });
  });

  it("passes a EUR price straight through", () => {
    expect(parseGoogleFinanceQuote(page("EUR 45.67"), NOW)).toMatchObject({ close: "45.67", currency: "EUR" });
  });

  it("strips thousands separators", () => {
    expect(parseGoogleFinanceQuote(page("USD 1,234.56"), NOW)?.close).toBe("1234.56");
  });

  it("returns null when there is no currency-prefixed price", () => {
    expect(parseGoogleFinanceQuote("<html>no quote</html>", NOW)).toBeNull();
    expect(parseGoogleFinanceQuote("", NOW)).toBeNull();
  });
});
