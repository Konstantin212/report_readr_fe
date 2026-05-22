import { createHmac } from "node:crypto";

/**
 * Coinbase v2 REST client. Authenticates with the legacy API-key + secret
 * pair (HMAC-SHA256 signature per request). Self-service OAuth is gated
 * to approved partners, so this is the realistic path for personal apps.
 *
 * Signature inputs: timestamp(seconds) + method(uppercase) + requestPath
 * + body(raw). The path includes the query string when present.
 *
 * The secret is held in memory only for the duration of a single signed
 * request — the persistence layer decrypts it on demand and never logs.
 */

export const COINBASE_API_BASE = "https://api.coinbase.com";
export const COINBASE_API_VERSION = "2024-01-01";

export type CoinbaseCredentials = { apiKey: string; apiSecret: string };

export type CoinbaseUser = {
  id: string;
  email?: string;
  name?: string;
};

export type CoinbaseAccount = {
  id: string;
  name: string;
  primary: boolean;
  type: string;
  currency: { code: string; name: string };
  balance: { amount: string; currency: string };
  native_balance?: { amount: string; currency: string };
  created_at: string;
  updated_at: string;
};

export type CoinbasePagination = {
  ending_before?: string | null;
  starting_after?: string | null;
  next_uri?: string | null;
  next_starting_after?: string | null;
};

export type CoinbasePaged<T> = { pagination: CoinbasePagination; data: T[] };

/**
 * Sign a v2 API request. Exposed for tests; production callers go
 * through `coinbaseFetch` which assembles headers + parses JSON.
 */
export function signRequest(
  credentials: CoinbaseCredentials,
  method: string,
  requestPath: string,
  body: string,
  timestampSeconds: number,
): { signature: string; timestamp: string } {
  const ts = String(timestampSeconds);
  const prehash = ts + method.toUpperCase() + requestPath + body;
  const signature = createHmac("sha256", credentials.apiSecret).update(prehash).digest("hex");
  return { signature, timestamp: ts };
}

export class CoinbaseAuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "CoinbaseAuthError";
  }
}

export async function coinbaseFetch<T>(
  credentials: CoinbaseCredentials,
  method: "GET" | "POST",
  path: string,
  init: { body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const query = init.query ? `?${new URLSearchParams(init.query).toString()}` : "";
  const requestPath = `${path}${query}`;
  const body = init.body ? JSON.stringify(init.body) : "";
  const { signature, timestamp } = signRequest(credentials, method, requestPath, body, Math.floor(Date.now() / 1000));

  const res = await fetch(`${COINBASE_API_BASE}${requestPath}`, {
    method,
    headers: {
      "CB-ACCESS-KEY": credentials.apiKey,
      "CB-ACCESS-SIGN": signature,
      "CB-ACCESS-TIMESTAMP": timestamp,
      "CB-VERSION": COINBASE_API_VERSION,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body || undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new CoinbaseAuthError(res.status, "Coinbase rejected the API key (invalid or revoked)");
    }
    throw new Error(`coinbase ${method} ${path} → ${res.status}: ${redactSensitive(text)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`coinbase ${method} ${path} returned non-JSON body`);
  }
}

export async function fetchCurrentUser(credentials: CoinbaseCredentials): Promise<CoinbaseUser> {
  const body = await coinbaseFetch<{ data: CoinbaseUser }>(credentials, "GET", "/v2/user");
  return body.data;
}

export async function fetchAccounts(credentials: CoinbaseCredentials): Promise<CoinbaseAccount[]> {
  const out: CoinbaseAccount[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 20; page++) {
    const body = await coinbaseFetch<CoinbasePaged<CoinbaseAccount>>(credentials, "GET", "/v2/accounts", {
      query: { limit: "100", ...(startingAfter ? { starting_after: startingAfter } : {}) },
    });
    out.push(...body.data);
    const next = body.pagination.next_starting_after;
    if (!next) break;
    startingAfter = next;
  }
  return out;
}

/**
 * Redact API keys, signatures, and secret-like strings from any payload
 * we might surface in logs or error messages. We do not log API
 * responses today, but this guards future callers.
 */
function redactSensitive(s: string): string {
  return s
    .replace(/"api[_-]?key":\s*"[^"]*"/gi, '"api_key":"[redacted]"')
    .replace(/"api[_-]?secret":\s*"[^"]*"/gi, '"api_secret":"[redacted]"')
    .replace(/"signature":\s*"[^"]*"/gi, '"signature":"[redacted]"');
}
