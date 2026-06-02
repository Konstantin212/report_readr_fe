import { createPrivateKey, randomBytes } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";

type CdpKey = Awaited<ReturnType<typeof importPKCS8>>;

/**
 * Coinbase Developer Platform (CDP) REST client.
 *
 * CDP API keys come as a {name, privateKey} pair from
 * portal.cdp.coinbase.com. Authentication is JWT-based: each request is
 * signed as an ES256 (ECDSA P-256) or EdDSA (Ed25519) JWT containing a
 * uri claim that binds the token to a specific METHOD + host + path. The
 * server rejects the JWT if the uri or expiry don't match.
 *
 * CDP keys are accepted on both the v3 brokerage endpoints and the
 * legacy /v2 wallet endpoints — we use /v2 because that's where staking
 * rewards surface as discrete `staking_reward` transactions, which is
 * exactly what Anlage SO needs.
 *
 * Read-only scope is configured on the key itself in Coinbase's UI
 * (View=on, Trade/Transfer/Receive=off). The client never sends
 * mutating verbs; if the key were misconfigured the worst case is a
 * Coinbase-side rejection, not silent state change.
 */

export const COINBASE_API_HOST = "api.coinbase.com";
export const COINBASE_API_BASE = `https://${COINBASE_API_HOST}`;
export const COINBASE_API_VERSION = "2024-01-01";

/**
 * The scope the user is instructed to set on their CDP key (View only).
 * We record this on the cryptoAccounts row purely as an audit hint — the
 * actual enforcement lives in Coinbase's UI.
 */
export const COINBASE_SCOPES_USED = "view";

export type CoinbaseCredentials = {
  /** The "name" field from the CDP key JSON, e.g. "organizations/UUID/apiKeys/UUID". */
  apiKey: string;
  /** The "privateKey" field from the CDP key JSON. EC PEM (ECDSA) or raw Ed25519 PKCS8 PEM. */
  apiSecret: string;
};

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
 * Parse the {name, privateKey} JSON the user pastes from Coinbase. Accepts
 * the raw JSON string or an already-parsed object; rejects anything that
 * doesn't have both fields populated.
 */
export function parseCredentialsBlob(input: string): CoinbaseCredentials {
  const trimmed = input.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Expected a JSON object with `name` and `privateKey` fields");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Credentials blob must be a JSON object");
  const obj = parsed as { name?: unknown; privateKey?: unknown };
  if (typeof obj.name !== "string" || !obj.name.startsWith("organizations/")) {
    throw new Error("`name` must look like organizations/UUID/apiKeys/UUID");
  }
  if (typeof obj.privateKey !== "string" || !obj.privateKey.includes("PRIVATE KEY")) {
    throw new Error("`privateKey` must be a PEM-encoded private key");
  }
  return { apiKey: obj.name, apiSecret: obj.privateKey };
}

type AlgVariant = { alg: "ES256" | "EdDSA"; key: CdpKey };

async function importCdpKey(pem: string): Promise<AlgVariant> {
  const normalized = pem.replace(/\\n/g, "\n");
  // ECDSA keys ship as "EC PRIVATE KEY"; CDP also issues Ed25519 keys as
  // raw PKCS8. importPKCS8 handles both as long as we feed the right alg.
  if (normalized.includes("BEGIN EC PRIVATE KEY")) {
    const pkcs8 = createPrivateKey(normalized).export({ format: "pem", type: "pkcs8" }).toString();
    const key = await importPKCS8(pkcs8, "ES256");
    return { alg: "ES256", key };
  }
  if (normalized.includes("BEGIN PRIVATE KEY")) {
    try {
      const key = await importPKCS8(normalized, "EdDSA");
      return { alg: "EdDSA", key };
    } catch {
      const key = await importPKCS8(normalized, "ES256");
      return { alg: "ES256", key };
    }
  }
  throw new Error("Unrecognized private key format (expected EC or PKCS8 PEM)");
}

/**
 * Sign a request. The `pathForSigning` MUST be the path only — no query
 * string. Coinbase validates the JWT uri claim against METHOD + HOST +
 * PATH (query string stripped), so including a query in the claim causes
 * the server to return 401/403 even though /v2/user (which has no query)
 * works fine with the same key. Discovered the hard way.
 */
export async function signRequest(
  credentials: CoinbaseCredentials,
  method: string,
  pathForSigning: string,
): Promise<string> {
  const variant = await importCdpKey(credentials.apiSecret);
  const nonce = randomBytes(16).toString("hex");
  const pathOnly = pathForSigning.split("?")[0];
  const uri = `${method.toUpperCase()} ${COINBASE_API_HOST}${pathOnly}`;
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ uri })
    .setProtectedHeader({ alg: variant.alg, kid: credentials.apiKey, typ: "JWT", nonce })
    .setIssuer("cdp")
    .setSubject(credentials.apiKey)
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(variant.key);
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
  const jwt = await signRequest(credentials, method, requestPath);
  const body = init.body ? JSON.stringify(init.body) : undefined;

  const res = await fetch(`${COINBASE_API_BASE}${requestPath}`, {
    method,
    headers: {
      authorization: `Bearer ${jwt}`,
      "CB-VERSION": COINBASE_API_VERSION,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new CoinbaseAuthError(res.status, "Coinbase rejected the API key (invalid, revoked, or wrong scope)");
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

export type CoinbaseTransaction = {
  id: string;
  type: string;
  status: string;
  amount: { amount: string; currency: string };
  native_amount: { amount: string; currency: string };
  description?: string;
  created_at: string;
  updated_at: string;
  details?: { title?: string; subtitle?: string; header?: string; payment_method_name?: string };
};

/**
 * Fetch every transaction newer than `endingBefore` (id) for one wallet,
 * walking pagination back to the cursor. On first sync (no cursor) we
 * walk all the way back through the wallet's history.
 *
 * Coinbase returns transactions in descending date order; ending_before
 * means "newer than this id", starting_after means "older than this id".
 */
export async function fetchTransactionsForAccount(
  credentials: CoinbaseCredentials,
  accountId: string,
  endingBefore?: string,
): Promise<CoinbaseTransaction[]> {
  const out: CoinbaseTransaction[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 100; page++) {
    const query: Record<string, string> = { limit: "100" };
    // Coinbase v2 rejects requests that carry BOTH ending_before and
    // starting_after. Use ending_before on the first page only; for
    // page 2+ switch to starting_after-only. We then short-circuit
    // pagination as soon as a page contains the cursor row (everything
    // older has already been synced), so dropping ending_before doesn't
    // cause us to walk the full history every time.
    if (startingAfter) query.starting_after = startingAfter;
    else if (endingBefore) query.ending_before = endingBefore;

    const body = await coinbaseFetch<CoinbasePaged<CoinbaseTransaction>>(
      credentials,
      "GET",
      `/v2/accounts/${accountId}/transactions`,
      { query },
    );

    if (endingBefore) {
      // Items are returned newest-first. If the cursor id appears in this
      // page, take everything strictly newer than it and stop.
      const cutoffIdx = body.data.findIndex((t) => t.id === endingBefore);
      if (cutoffIdx >= 0) {
        out.push(...body.data.slice(0, cutoffIdx));
        break;
      }
    }
    out.push(...body.data);

    const next = body.pagination.next_starting_after;
    if (!next) break;
    startingAfter = next;
  }
  return out;
}

/**
 * Public Coinbase spot price endpoint — no auth required. Used to compute
 * wallet EUR values because CDP-key access to /v2/accounts returns
 * native_balance = 0 instead of the actual conversion. Returns the EUR
 * price per 1 unit of `symbol`, or null on 404 (rare coin not quoted).
 */
export async function fetchSpotPriceEur(symbol: string): Promise<string | null> {
  const res = await fetch(`${COINBASE_API_BASE}/v2/prices/${symbol}-EUR/spot`, {
    headers: { "CB-VERSION": COINBASE_API_VERSION },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`coinbase spot ${symbol}-EUR → ${res.status}`);
  }
  const body = (await res.json()) as { data: { amount: string; currency: string } };
  return body.data?.amount ?? null;
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

function redactSensitive(s: string): string {
  return s
    .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[^-]+-----END [^-]+ PRIVATE KEY-----/g, "[redacted-private-key]")
    .replace(/"(privateKey|api[_-]?key|api[_-]?secret|authorization)":\s*"[^"]*"/gi, '"$1":"[redacted]"');
}

