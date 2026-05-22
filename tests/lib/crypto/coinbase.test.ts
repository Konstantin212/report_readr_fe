import { generateKeyPairSync } from "node:crypto";
import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CoinbaseAuthError,
  coinbaseFetch,
  fetchAccounts,
  fetchCurrentUser,
  parseCredentialsBlob,
  signRequest,
} from "@/lib/crypto/coinbase";

function makeEcKeypair() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    privatePem: privateKey.export({ format: "pem", type: "sec1" }).toString(),
    publicPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

const KEY_NAME = "organizations/abc-123/apiKeys/def-456";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("crypto/coinbase JWT (CDP keys)", () => {
  it("parses the {name, privateKey} JSON blob", () => {
    const { privatePem } = makeEcKeypair();
    const blob = JSON.stringify({ name: KEY_NAME, privateKey: privatePem });
    const out = parseCredentialsBlob(blob);
    expect(out.apiKey).toBe(KEY_NAME);
    expect(out.apiSecret).toBe(privatePem);
  });

  it("rejects malformed blobs", () => {
    expect(() => parseCredentialsBlob("not-json")).toThrow();
    expect(() => parseCredentialsBlob(JSON.stringify({ name: KEY_NAME }))).toThrow(/privateKey/);
    expect(() => parseCredentialsBlob(JSON.stringify({ name: "wrong-shape", privateKey: "x" }))).toThrow(/organizations/);
    expect(() => parseCredentialsBlob(JSON.stringify({ name: KEY_NAME, privateKey: "no-pem" }))).toThrow(/PEM/);
  });

  it("signs a verifiable ES256 JWT bound to METHOD + host + path", async () => {
    const { privatePem, publicPem } = makeEcKeypair();
    const jwt = await signRequest({ apiKey: KEY_NAME, apiSecret: privatePem }, "GET", "/v2/user");
    const verifyKey = await importSPKI(publicPem, "ES256");
    const { payload, protectedHeader } = await jwtVerify(jwt, verifyKey, { issuer: "cdp", subject: KEY_NAME });
    expect(protectedHeader.alg).toBe("ES256");
    expect(protectedHeader.kid).toBe(KEY_NAME);
    expect(protectedHeader.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(payload.uri).toBe("GET api.coinbase.com/v2/user");
    expect(typeof payload.exp).toBe("number");
    expect((payload.exp as number) - (payload.nbf as number)).toBe(120);
  });

  it("strips the query string from the JWT uri claim while keeping it in the URL", async () => {
    // Coinbase rejects JWTs whose `uri` claim contains a query string,
    // so we sign only the path. The fetch URL still carries the query.
    const { privatePem } = makeEcKeypair();
    let capturedJwt: string | undefined;
    let capturedUrl: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      capturedUrl = url as string;
      const h = init!.headers as Record<string, string>;
      capturedJwt = h.authorization!.replace(/^Bearer /, "");
      return new Response(JSON.stringify({ pagination: {}, data: [] }), { status: 200 });
    });

    await coinbaseFetch({ apiKey: KEY_NAME, apiSecret: privatePem }, "GET", "/v2/accounts", {
      query: { limit: "100" },
    });
    const claims = decodeJwt(capturedJwt!);
    expect(claims.uri).toBe("GET api.coinbase.com/v2/accounts");
    expect(capturedUrl).toBe("https://api.coinbase.com/v2/accounts?limit=100");
  });

  it("issues a fresh nonce per signing call", async () => {
    const { privatePem } = makeEcKeypair();
    const a = await signRequest({ apiKey: KEY_NAME, apiSecret: privatePem }, "GET", "/v2/user");
    const b = await signRequest({ apiKey: KEY_NAME, apiSecret: privatePem }, "GET", "/v2/user");
    expect(decodeProtectedHeader(a).nonce).not.toBe(decodeProtectedHeader(b).nonce);
  });

  it("sends an Authorization: Bearer header and CB-VERSION", async () => {
    const { privatePem } = makeEcKeypair();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ data: { id: "u1" } }), { status: 200 }));
    await fetchCurrentUser({ apiKey: KEY_NAME, apiSecret: privatePem });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.coinbase.com/v2/user");
    const headers = init!.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer ey/);
    expect(headers["CB-VERSION"]).toBe("2024-01-01");
  });

  it("throws CoinbaseAuthError on 401 and 403", async () => {
    const { privatePem } = makeEcKeypair();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(fetchCurrentUser({ apiKey: KEY_NAME, apiSecret: privatePem })).rejects.toBeInstanceOf(
      CoinbaseAuthError,
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(fetchCurrentUser({ apiKey: KEY_NAME, apiSecret: privatePem })).rejects.toBeInstanceOf(
      CoinbaseAuthError,
    );
  });

  it("redacts private-key blocks and credential fields from error bodies", async () => {
    const { privatePem } = makeEcKeypair();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "rate_limited", privateKey: "leaked-key-string", api_secret: "leaked-secret" }),
        { status: 429 },
      ),
    );
    await expect(coinbaseFetch({ apiKey: KEY_NAME, apiSecret: privatePem }, "GET", "/v2/x")).rejects.toThrow(
      /\[redacted\]/,
    );
    await expect(coinbaseFetch({ apiKey: KEY_NAME, apiSecret: privatePem }, "GET", "/v2/x")).rejects.not.toThrow(
      /leaked-(key-string|secret)/,
    );
  });

  it("paginates fetchAccounts using next_starting_after", async () => {
    const { privatePem } = makeEcKeypair();
    const page1 = {
      pagination: { next_starting_after: "cursor-2" },
      data: [{ id: "btc" }, { id: "eth" }],
    };
    const page2 = {
      pagination: { next_starting_after: null },
      data: [{ id: "sol" }],
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }));

    const accounts = await fetchAccounts({ apiKey: KEY_NAME, apiSecret: privatePem });
    expect(accounts.map((a) => a.id)).toEqual(["btc", "eth", "sol"]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]![0]).toContain("starting_after=cursor-2");
  });
});
