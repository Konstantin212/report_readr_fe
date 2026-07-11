/**
 * Finviz quote scraper — pure parser.
 *
 * The finviz stock page (finviz.com/quote.ashx?t=SYM → /stock?t=SYM) embeds a
 * daily-chart JSON object in the HTML:
 *   {"version":7,"ticker":"CRCL","timeframe":"d",...,"lastClose":66.14,
 *    ...,"lastDate":20260710,"lastTime":...,"prevClose":63.01,...}
 * We read lastClose + lastDate and validate the ticker so a wrong/empty page
 * can never be cached under the requested symbol. US listings only → USD.
 */
import { describe, it, expect } from "vitest";
import { parseFinvizQuote } from "@/lib/marketdata/providers/finviz";

const page = (ticker: string, lastClose: string, lastDate: string) =>
  `<html><body><script>window.x={"version":7,"ticker":"${ticker}","timeframe":"d",` +
  `"volume":[1,2],"close":[63.01,66.14],"lastOpen":69.58,"lastHigh":72.85,"lastLow":65.06,` +
  `"lastClose":${lastClose},"lastVolume":36573028,"lastDate":${lastDate},"lastTime":1783713600,` +
  `"prevClose":63.0099983215332}</script></body></html>`;

describe("parseFinvizQuote", () => {
  it("extracts lastClose + lastDate for the requested US ticker", () => {
    expect(parseFinvizQuote(page("CRCL", "66.13999938964844", "20260710"), "CRCL")).toEqual({
      close: "66.14",
      currency: "USD",
      date: "2026-07-10",
      source: "FINVIZ",
    });
  });

  it("is case-insensitive on the requested symbol", () => {
    expect(parseFinvizQuote(page("TTWO", "254.89", "20260710"), "ttwo")?.close).toBe("254.89");
  });

  it("returns null when the page is for a DIFFERENT ticker (never cache a mismatch)", () => {
    expect(parseFinvizQuote(page("CRCL", "66.14", "20260710"), "AAPL")).toBeNull();
  });

  it("returns null when the quote fields are missing", () => {
    expect(parseFinvizQuote("<html>no quote here</html>", "CRCL")).toBeNull();
    expect(parseFinvizQuote("", "CRCL")).toBeNull();
  });

  it("handles a dotted symbol without a regex blow-up", () => {
    expect(parseFinvizQuote(page("BRK.B", "445.10", "20260710"), "BRK.B")?.close).toBe("445.10");
  });
});
