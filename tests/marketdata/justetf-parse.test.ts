import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  extractByTestId,
  parseEtfProfile,
  deriveFundSubtype,
  parseQuoteResponse,
} from "@/lib/marketdata/providers/justetf";

const PROFILE_HTML = readFileSync(
  "tests/fixtures/marketdata/justetf.IE00B0M63177.html",
  "utf8",
);

describe("extractByTestId", () => {
  it("returns the inner text of the element carrying the testid", () => {
    const html = `<div data-testid="x">Hello</div>`;
    expect(extractByTestId(html, "x")).toBe("Hello");
  });

  it("strips nested markup and collapses whitespace", () => {
    const html = `<div data-testid="x">  Hello <span class="b">brave</span>\n  world </div>`;
    expect(extractByTestId(html, "x")).toBe("Hello brave world");
  });

  it("decodes the HTML entities in scope", () => {
    const html = `<td data-testid="x">A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;&nbsp;F</td>`;
    expect(extractByTestId(html, "x")).toBe(`A & B <C> "D" 'E' F`);
  });

  it("handles nested elements of the SAME tag name via depth counting", () => {
    const html = `<div data-testid="x">outer <div>inner</div> tail</div><div>sibling</div>`;
    expect(extractByTestId(html, "x")).toBe("outer inner tail");
  });

  it("is not fooled by attribute values or other testids", () => {
    const html = `<span data-testid="y">nope</span><b data-testid="x">yes</b>`;
    expect(extractByTestId(html, "x")).toBe("yes");
  });

  it("returns null when the testid is absent", () => {
    expect(extractByTestId(`<div data-testid="a">z</div>`, "missing")).toBeNull();
  });
});

describe("parseEtfProfile (real slim fixture)", () => {
  const p = parseEtfProfile(PROFILE_HTML);

  it("reads the header identity fields", () => {
    expect(p.name).toBe("iShares MSCI EM UCITS ETF (Dist)");
    expect(p.ticker).toBe("IQQE");
    expect(p.wkn).toBe("A0HGWC");
    expect(p.terPct).toBe("0.18");
    expect(p.replication).toBe("Physical");
  });

  it("reads the basics block", () => {
    expect(p.distributionPolicy).toBe("DISTRIBUTING");
    expect(p.distributionFrequency).toBe("Quarterly");
    expect(p.fundCurrency).toBe("USD");
    expect(p.domicile).toBe("Ireland");
    expect(p.indexName).toBe("MSCI Emerging Markets");
    expect(p.investmentFocus).toBe("Equity, Emerging Markets");
  });

  it("derives the German tax fields from the tax-rebate cell", () => {
    expect(p.teilfreistellungPct).toBe(30);
    expect(p.fundSubtype).toBe("aktien");
  });
});

describe("deriveFundSubtype", () => {
  it("maps each Teilfreistellung rate to its fund class", () => {
    expect(deriveFundSubtype(30)).toBe("aktien");
    expect(deriveFundSubtype(15)).toBe("misch");
    expect(deriveFundSubtype(60)).toBe("immo_inland");
    expect(deriveFundSubtype(80)).toBe("immo_ausland");
    expect(deriveFundSubtype(null)).toBe("sonstige");
    expect(deriveFundSubtype(0)).toBe("sonstige");
  });
});

describe("parseQuoteResponse", () => {
  const quoteJson = JSON.parse(
    readFileSync("tests/fixtures/marketdata/justetf.quote.IE00B0M63177.json", "utf8"),
  );

  it("parses the real quote fixture", () => {
    expect(parseQuoteResponse(quoteJson)).toEqual({
      close: "59.00",
      currency: "EUR",
      date: "2026-07-03",
      source: "JUSTETF",
    });
  });

  it("returns null for malformed / empty payloads", () => {
    expect(parseQuoteResponse({})).toBeNull();
    expect(parseQuoteResponse({ latestQuote: {} })).toBeNull();
    expect(parseQuoteResponse(null)).toBeNull();
    expect(parseQuoteResponse({ latestQuote: { raw: 59 } })).toBeNull(); // no date
  });
});
