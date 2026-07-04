/**
 * justETF metadata + quote provider.
 *
 * Scope: PUBLIC pages only — the English ETF-profile page
 * (`/en/etf-profile.html?isin=…`) and the public quote JSON endpoint
 * (`/api/etfs/{isin}/quote`). No login, no private API.
 *
 * Selector strategy: we pin extraction to justETF's OWN `data-testid`
 * contract rather than CSS classes or DOM position. Those testids are a
 * stable, intentional interface (they exist for justETF's own e2e tests),
 * so they survive cosmetic re-skins far better than class names would.
 * Zero new dependencies — a small `data-testid`-anchored regex reader
 * instead of a full HTML parser (no cheerio).
 *
 * Courtesy constraints (rate limiting, caching, backoff) are the enrich
 * layer's job — this module just performs one polite request per call
 * with a browser User-Agent and a hard 10 s timeout.
 */
import type { FundSubtype } from "@/lib/analytics/sector-map";
import type {
  DistributionPolicy,
  InstrumentRef,
  MetaResult,
  MetadataProvider,
  QuoteResult,
} from "@/lib/marketdata/types";

const JUSTETF_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 10_000;

// --- Pure text extraction ------------------------------------------------

const ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/g, " "],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  // &amp; last so we never double-decode a literal like "&amp;lt;".
  [/&amp;/g, "&"],
];

function decodeEntities(s: string): string {
  let out = s;
  for (const [re, rep] of ENTITIES) out = out.replace(re, rep);
  return out;
}

/** Strip nested tags, decode entities, collapse whitespace, trim. */
function cleanText(inner: string): string {
  return decodeEntities(inner.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the element carrying `data-testid="{testId}"` and return its inner
 * text (tags stripped, entities decoded, whitespace collapsed). Handles
 * nested markup of the same tag name via depth counting. Returns null when
 * the testid is absent. Never throws.
 *
 * Attribute values on justETF never contain a raw `>` (they entity-encode
 * as `&gt;`/`&quot;`), so the `[^>]` scan for the opening tag is safe.
 */
export function extractByTestId(html: string, testId: string): string | null {
  const open = new RegExp(
    `<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\bdata-testid="${escapeRegExp(testId)}"[^>]*?(/?)>`,
  );
  const m = open.exec(html);
  if (!m) return null;
  // Self-closing element carrying the testid has no inner text.
  if (m[2] === "/") return "";

  const tag = m[1];
  const start = m.index + m[0].length;
  const scan = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}\\s*>`, "gi");
  scan.lastIndex = start;

  let depth = 1;
  let end = html.length;
  let s: RegExpExecArray | null;
  while ((s = scan.exec(html)) !== null) {
    if (s[0].startsWith("</")) {
      depth--;
      if (depth === 0) {
        end = s.index;
        break;
      }
    } else if (s[1] !== "/") {
      depth++;
    }
  }
  return cleanText(html.slice(start, end));
}

/** Map a justETF distribution-policy label to our enum. */
function toDistributionPolicy(text: string | null): DistributionPolicy | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (t.startsWith("distributing")) return "DISTRIBUTING";
  if (t.startsWith("accumulating")) return "ACCUMULATING";
  return null;
}

/** "0.18% p.a." → "0.18" (numeric-as-string). Null if no number present. */
function parseTerPct(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? m[1] : null;
}

/**
 * German Teilfreistellung comes from the "tax rebate" cell, which has no
 * testid — anchor to the label text instead. "30% tax rebate" → 30.
 */
function parseTeilfreistellung(html: string): number | null {
  const m = html.match(/(\d+)\s*%\s*tax rebate/i);
  return m ? Number.parseInt(m[1], 10) : null;
}

/**
 * Derive the German KAP-INV fund subtype from the Teilfreistellung rate.
 * The rate uniquely identifies the fund class: 30% equity, 15% mixed,
 * 60% domestic real-estate, 80% foreign real-estate. Anything else (or a
 * missing rate) falls back to "sonstige" (0% — the safe, higher-tax
 * default the ELSTER builder routes to Z8).
 */
export function deriveFundSubtype(teilfreistellungPct: number | null): FundSubtype {
  switch (teilfreistellungPct) {
    case 30:
      return "aktien";
    case 15:
      return "misch";
    case 60:
      return "immo_inland";
    case 80:
      return "immo_ausland";
    default:
      return "sonstige";
  }
}

export type ParsedEtfProfile = {
  name: string | null;
  ticker: string | null;
  wkn: string | null;
  terPct: string | null;
  distributionPolicy: DistributionPolicy | null;
  distributionFrequency: string | null;
  fundCurrency: string | null;
  domicile: string | null;
  indexName: string | null;
  investmentFocus: string | null;
  replication: string | null;
  teilfreistellungPct: number | null;
  fundSubtype: FundSubtype;
};

/**
 * Parse a justETF ETF-profile HTML page. Every field degrades to null on
 * a miss — this function never throws, so the enrich layer can trust an
 * OK result even if justETF drops or renames one row.
 */
export function parseEtfProfile(html: string): ParsedEtfProfile {
  const teilfreistellungPct = parseTeilfreistellung(html);
  return {
    name: extractByTestId(html, "etf-profile-header_etf-name") || null,
    ticker: extractByTestId(html, "etf-profile-header_identifier-value-ticker") || null,
    wkn: extractByTestId(html, "etf-profile-header_identifier-value-wkn") || null,
    terPct: parseTerPct(extractByTestId(html, "etf-profile-header_ter-value")),
    distributionPolicy: toDistributionPolicy(
      extractByTestId(html, "tl_etf-basics_value_distribution-policy") ??
        extractByTestId(html, "etf-profile-header_distribution-policy-value"),
    ),
    distributionFrequency:
      extractByTestId(html, "tl_etf-basics_value_distribution-interval") || null,
    fundCurrency: extractByTestId(html, "tl_etf-basics_value_fund-currency") || null,
    domicile: extractByTestId(html, "tl_etf-basics_value_domicile-country") || null,
    indexName: extractByTestId(html, "tl_etf-basics_value_index-name") || null,
    investmentFocus: extractByTestId(html, "tl_etf-basics_value_investment-focus") || null,
    replication: extractByTestId(html, "etf-profile-header_replication-value") || null,
    teilfreistellungPct,
    fundSubtype: deriveFundSubtype(teilfreistellungPct),
  };
}

/**
 * Parse justETF's public quote JSON:
 *   {"latestQuote":{"raw":59.00},"latestQuoteDate":"2026-07-03", …}
 * We always request `currency=EUR`, so the close is in EUR. Malformed or
 * missing payloads → null.
 */
export function parseQuoteResponse(json: unknown): QuoteResult {
  if (!json || typeof json !== "object") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = json as any;
  const raw = q.latestQuote?.raw;
  const date = q.latestQuoteDate;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (typeof date !== "string" || date.length === 0) return null;
  return { close: raw.toFixed(2), currency: "EUR", date, source: "JUSTETF" };
}

// --- Impure: network -----------------------------------------------------

/**
 * Fetch + parse the ETF-profile page for an ISIN.
 *
 *  - 30x whose `location` points at `/search.html` → NOT_FOUND: justETF
 *    authoritatively doesn't know this ISIN (not an EU-registered ETF).
 *  - 200 → parse the page into an OK result (assetKind "etf").
 *  - any other status / thrown error (timeout, network) → ERROR (the
 *    router treats this as transient and stops the chain for retry).
 */
export async function fetchEtfProfile(isin: string): Promise<MetaResult> {
  try {
    const url = `https://www.justetf.com/en/etf-profile.html?isin=${encodeURIComponent(isin)}`;
    const res = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": JUSTETF_UA },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") ?? "";
      if (location.includes("/search.html")) return { status: "NOT_FOUND" };
      return {
        status: "ERROR",
        error: `justETF redirected to unexpected location (${res.status}): ${location || "(none)"}`,
      };
    }

    if (res.status === 200) {
      const html = await res.text();
      const parsed = parseEtfProfile(html);
      return {
        status: "OK",
        source: "JUSTETF",
        assetKind: "etf",
        fields: {
          name: parsed.name,
          justetfTicker: parsed.ticker,
          wkn: parsed.wkn,
          terPct: parsed.terPct,
          distributionPolicy: parsed.distributionPolicy,
          distributionFrequency: parsed.distributionFrequency,
          fundCurrency: parsed.fundCurrency,
          domicile: parsed.domicile,
          indexName: parsed.indexName,
          investmentFocus: parsed.investmentFocus,
          replication: parsed.replication,
          teilfreistellungPct: parsed.teilfreistellungPct,
          fundSubtype: parsed.fundSubtype,
        },
        raw: parsed,
      };
    }

    return { status: "ERROR", error: `justETF returned status ${res.status}` };
  } catch (e) {
    return { status: "ERROR", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Fetch + parse the public EUR quote for an ISIN. Any failure → null. */
export async function fetchEtfQuote(isin: string): Promise<QuoteResult> {
  try {
    const url = `https://www.justetf.com/api/etfs/${encodeURIComponent(isin)}/quote?locale=en&currency=EUR`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": JUSTETF_UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return parseQuoteResponse(await res.json());
  } catch {
    return null;
  }
}

/** Port adapter: resolve metadata for a ref via the profile page. */
export function fetchMeta(ref: InstrumentRef): Promise<MetaResult> {
  return fetchEtfProfile(ref.isin);
}

/** Port adapter: resolve the latest EUR quote for a ref. */
export function fetchQuote(ref: InstrumentRef): Promise<QuoteResult> {
  return fetchEtfQuote(ref.isin);
}

export const justEtfProvider: MetadataProvider = {
  id: "justetf",
  fetchMeta,
};
