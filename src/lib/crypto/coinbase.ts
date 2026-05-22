/**
 * Coinbase v2 OAuth2 client. Handles authorization URL building, code
 * exchange, refresh-token rotation, and revoke. Pure functions over fetch
 * so they're trivial to mock in tests — the persistence layer wraps these
 * with encryption + DB writes.
 *
 * Scopes intentionally read-only: wallet:user:read, wallet:accounts:read,
 * wallet:transactions:read. Trade/send scopes are never requested.
 */

export const COINBASE_AUTHORIZE_URL = "https://www.coinbase.com/oauth/authorize";
export const COINBASE_TOKEN_URL = "https://api.coinbase.com/oauth/token";
export const COINBASE_REVOKE_URL = "https://api.coinbase.com/oauth/revoke";
export const COINBASE_API_BASE = "https://api.coinbase.com/v2";

export const COINBASE_SCOPES = [
  "wallet:user:read",
  "wallet:accounts:read",
  "wallet:transactions:read",
] as const;

export type CoinbaseTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export type CoinbaseUser = {
  id: string;
  email?: string;
  name?: string;
};

export type CoinbaseConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function readConfig(): CoinbaseConfig {
  const clientId = process.env.COINBASE_CLIENT_ID;
  const clientSecret = process.env.COINBASE_CLIENT_SECRET;
  const redirectUri = process.env.COINBASE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("COINBASE_CLIENT_ID / COINBASE_CLIENT_SECRET / COINBASE_REDIRECT_URI are required");
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizationUrl(state: string, config: CoinbaseConfig = readConfig()): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scope: COINBASE_SCOPES.join(","),
    account: "all",
  });
  return `${COINBASE_AUTHORIZE_URL}?${params.toString()}`;
}

async function postForm(url: string, body: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`coinbase ${url} → ${res.status}: ${redactTokens(text)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`coinbase ${url} returned non-JSON body`);
  }
}

export async function exchangeCodeForTokens(
  code: string,
  config: CoinbaseConfig = readConfig(),
): Promise<CoinbaseTokenResponse> {
  return (await postForm(COINBASE_TOKEN_URL, {
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  })) as CoinbaseTokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string,
  config: CoinbaseConfig = readConfig(),
): Promise<CoinbaseTokenResponse> {
  return (await postForm(COINBASE_TOKEN_URL, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })) as CoinbaseTokenResponse;
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await postForm(COINBASE_REVOKE_URL, { token: refreshToken });
}

export async function fetchCurrentUser(accessToken: string): Promise<CoinbaseUser> {
  const res = await fetch(`${COINBASE_API_BASE}/user`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "CB-VERSION": "2024-01-01",
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`coinbase /user → ${res.status}: ${redactTokens(t)}`);
  }
  const body = (await res.json()) as { data: CoinbaseUser };
  return body.data;
}

/**
 * Strip access_token / refresh_token values out of an error body before
 * we surface it in logs. Coinbase error payloads occasionally echo tokens
 * back; we never want them in the runtime logs.
 */
function redactTokens(s: string): string {
  return s
    .replace(/"access_token":\s*"[^"]*"/g, '"access_token":"[redacted]"')
    .replace(/"refresh_token":\s*"[^"]*"/g, '"refresh_token":"[redacted]"');
}
