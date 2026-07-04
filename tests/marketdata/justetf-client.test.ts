import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fetchMeta, fetchQuote } from "@/lib/marketdata/providers/justetf";

const PROFILE_HTML = readFileSync(
  "tests/fixtures/marketdata/justetf.IE00B0M63177.html",
  "utf8",
);
const QUOTE_JSON = readFileSync(
  "tests/fixtures/marketdata/justetf.quote.IE00B0M63177.json",
  "utf8",
);

const REF = { isin: "IE00B0M63177", symbol: "IQQE", currency: "EUR" };

const origFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = origFetch;
  vi.restoreAllMocks();
});

describe("fetchMeta", () => {
  it("returns NOT_FOUND when justETF redirects to the search page", async () => {
    // redirect:"manual" surfaces the 30x; a Location under /search.html is
    // justETF saying authoritatively 'not an EU ETF'.
    globalThis.fetch = vi.fn(async () => ({
      status: 302,
      headers: new Headers({ location: "/en/search.html?query=IE00B0M63177" }),
      text: async () => "",
    })) as unknown as typeof globalThis.fetch;

    const out = await fetchMeta(REF);
    expect(out).toEqual({ status: "NOT_FOUND" });
  });

  it("returns OK with assetKind 'etf' and the parsed fields on a 200", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(PROFILE_HTML, { status: 200 }),
    ) as typeof globalThis.fetch;

    const out = await fetchMeta(REF);
    expect(out.status).toBe("OK");
    if (out.status !== "OK") throw new Error("expected OK");
    expect(out.source).toBe("JUSTETF");
    expect(out.assetKind).toBe("etf");
    expect(out.fields.teilfreistellungPct).toBe(30);
    expect(out.fields.fundSubtype).toBe("aktien");
    expect(out.fields.justetfTicker).toBe("IQQE");
    expect(out.fields.name).toBe("iShares MSCI EM UCITS ETF (Dist)");
  });

  it("returns ERROR when the request throws (timeout / network)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("The operation was aborted due to timeout");
    }) as unknown as typeof globalThis.fetch;

    const out = await fetchMeta(REF);
    expect(out.status).toBe("ERROR");
    if (out.status !== "ERROR") throw new Error("expected ERROR");
    expect(out.error).toContain("timeout");
  });

  it("returns ERROR on a non-200, non-redirect status", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("bad gateway", { status: 502 }),
    ) as typeof globalThis.fetch;

    const out = await fetchMeta(REF);
    expect(out.status).toBe("ERROR");
  });
});

describe("fetchQuote", () => {
  it("returns a non-null quote on a 200 with the JSON payload", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(QUOTE_JSON, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as typeof globalThis.fetch;

    const out = await fetchQuote(REF);
    expect(out).not.toBeNull();
    expect(out?.close).toBe("59.00");
    expect(out?.currency).toBe("EUR");
    expect(out?.date).toBe("2026-07-03");
    expect(out?.source).toBe("JUSTETF");
  });

  it("returns null on a non-OK response", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("nope", { status: 500 }),
    ) as typeof globalThis.fetch;

    expect(await fetchQuote(REF)).toBeNull();
  });

  it("returns null when the request throws", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof globalThis.fetch;

    expect(await fetchQuote(REF)).toBeNull();
  });
});
