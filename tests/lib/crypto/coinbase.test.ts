import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CoinbaseAuthError,
  coinbaseFetch,
  fetchAccounts,
  fetchCurrentUser,
  signRequest,
} from "@/lib/crypto/coinbase";

const CREDS = { apiKey: "key-public", apiSecret: "secret-server-only" };

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("crypto/coinbase HMAC", () => {
  it("signs a request with hex HMAC-SHA256 over timestamp+method+path+body", () => {
    const { signature, timestamp } = signRequest(CREDS, "GET", "/v2/user", "", 1700000000);
    const expected = createHmac("sha256", CREDS.apiSecret).update("1700000000GET/v2/user").digest("hex");
    expect(signature).toBe(expected);
    expect(timestamp).toBe("1700000000");
  });

  it("normalizes method to uppercase in the prehash", () => {
    const a = signRequest(CREDS, "get", "/v2/user", "", 1700000000).signature;
    const b = signRequest(CREDS, "GET", "/v2/user", "", 1700000000).signature;
    expect(a).toBe(b);
  });

  it("includes the JSON body in the prehash for POST", () => {
    const body = JSON.stringify({ foo: "bar" });
    const { signature } = signRequest(CREDS, "POST", "/v2/some/path", body, 1700000000);
    const expected = createHmac("sha256", CREDS.apiSecret)
      .update("1700000000POST/v2/some/path" + body)
      .digest("hex");
    expect(signature).toBe(expected);
  });

  it("sends CB-ACCESS-* headers on a GET", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ data: { id: "u1" } }), { status: 200 }));
    await fetchCurrentUser(CREDS);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.coinbase.com/v2/user");
    const headers = init!.headers as Record<string, string>;
    expect(headers["CB-ACCESS-KEY"]).toBe(CREDS.apiKey);
    expect(headers["CB-ACCESS-SIGN"]).toMatch(/^[0-9a-f]{64}$/);
    expect(headers["CB-ACCESS-TIMESTAMP"]).toMatch(/^\d+$/);
    expect(headers["CB-VERSION"]).toBe("2024-01-01");
  });

  it("throws CoinbaseAuthError on 401 and 403", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(fetchCurrentUser(CREDS)).rejects.toBeInstanceOf(CoinbaseAuthError);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(fetchCurrentUser(CREDS)).rejects.toBeInstanceOf(CoinbaseAuthError);
  });

  it("redacts api_key / api_secret / signature from error bodies", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "rate_limited",
          api_key: "leaked-key",
          api_secret: "leaked-secret",
          signature: "leaked-sig",
        }),
        { status: 429 },
      ),
    );
    await expect(coinbaseFetch(CREDS, "GET", "/v2/anything")).rejects.toThrow(/\[redacted\]/);
    await expect(coinbaseFetch(CREDS, "GET", "/v2/anything")).rejects.not.toThrow(/leaked-(key|secret|sig)/);
  });

  it("paginates fetchAccounts using next_starting_after", async () => {
    const page1 = {
      pagination: { next_starting_after: "cursor-page-2" },
      data: [{ id: "btc", name: "BTC Wallet" }, { id: "eth", name: "ETH Wallet" }],
    };
    const page2 = {
      pagination: { next_starting_after: null },
      data: [{ id: "sol", name: "SOL Wallet" }],
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }));

    const accounts = await fetchAccounts(CREDS);
    expect(accounts.map((a) => a.id)).toEqual(["btc", "eth", "sol"]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondUrl = fetchSpy.mock.calls[1]![0] as string;
    expect(secondUrl).toContain("starting_after=cursor-page-2");
  });

  it("query string is included in the signed path", async () => {
    let capturedSig: string | undefined;
    let capturedTs: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const h = init!.headers as Record<string, string>;
      capturedSig = h["CB-ACCESS-SIGN"];
      capturedTs = h["CB-ACCESS-TIMESTAMP"];
      return new Response(JSON.stringify({ pagination: {}, data: [] }), { status: 200 });
    });

    await coinbaseFetch(CREDS, "GET", "/v2/accounts", { query: { limit: "100" } });

    const expected = createHmac("sha256", CREDS.apiSecret)
      .update(capturedTs! + "GET/v2/accounts?limit=100")
      .digest("hex");
    expect(capturedSig).toBe(expected);
  });
});
