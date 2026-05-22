import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAuthorizationUrl,
  COINBASE_SCOPES,
  exchangeCodeForTokens,
  fetchCurrentUser,
  refreshAccessToken,
  revokeRefreshToken,
} from "@/lib/crypto/coinbase";

const CONFIG = {
  clientId: "client-id-public",
  clientSecret: "client-secret-server-only",
  redirectUri: "https://example.com/api/auth/coinbase/callback",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("crypto/coinbase OAuth", () => {
  it("builds an authorization URL with the read-only scopes only", () => {
    const url = new URL(buildAuthorizationUrl("state-abc", CONFIG));
    expect(url.origin + url.pathname).toBe("https://www.coinbase.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(CONFIG.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG.redirectUri);
    expect(url.searchParams.get("state")).toBe("state-abc");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(COINBASE_SCOPES.join(","));
    // We never request trade or send scopes.
    expect(url.searchParams.get("scope")).not.toMatch(/trade|send/);
  });

  it("exchanges an authorization code for a token bundle", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "ACCESS",
          refresh_token: "REFRESH",
          expires_in: 7200,
          scope: COINBASE_SCOPES.join(","),
          token_type: "bearer",
        }),
        { status: 200 },
      ),
    );

    const out = await exchangeCodeForTokens("authcode", CONFIG);
    expect(out.access_token).toBe("ACCESS");
    expect(out.refresh_token).toBe("REFRESH");

    const [calledUrl, init] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe("https://api.coinbase.com/oauth/token");
    const body = new URLSearchParams(init!.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("authcode");
    expect(body.get("client_secret")).toBe(CONFIG.clientSecret);
  });

  it("refreshes using the refresh_token grant", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "NEW_ACCESS",
          refresh_token: "NEW_REFRESH",
          expires_in: 7200,
          scope: COINBASE_SCOPES.join(","),
          token_type: "bearer",
        }),
        { status: 200 },
      ),
    );

    const out = await refreshAccessToken("old-refresh", CONFIG);
    expect(out.refresh_token).toBe("NEW_REFRESH");

    const body = new URLSearchParams(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("old-refresh");
  });

  it("redacts token strings from error bodies on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "invalid_grant", access_token: "leaked-access", refresh_token: "leaked-refresh" }),
        { status: 400 },
      ),
    );

    await expect(exchangeCodeForTokens("bad", CONFIG)).rejects.toThrow(/\[redacted\]/);
    await expect(exchangeCodeForTokens("bad", CONFIG)).rejects.not.toThrow(/leaked-access/);
  });

  it("revokes a refresh token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await revokeRefreshToken("the-refresh");
    const body = new URLSearchParams(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.get("token")).toBe("the-refresh");
    expect(fetchSpy.mock.calls[0]![0]).toBe("https://api.coinbase.com/oauth/revoke");
  });

  it("fetches the connected user via /v2/user", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "cb-user-1", email: "me@example.com" } }), { status: 200 }),
    );

    const u = await fetchCurrentUser("ACCESS");
    expect(u.id).toBe("cb-user-1");
    expect(u.email).toBe("me@example.com");
  });
});
