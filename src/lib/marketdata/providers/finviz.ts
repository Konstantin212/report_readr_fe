/**
 * Finviz quote provider (US stocks).
 *
 * Yahoo's chart endpoints throttle/refuse our Vercel data-center IP for many
 * symbols; FMP's free tier only covers a subset of US names (DIS/C/HOOD yes;
 * TTWO/NEM/O no). Finviz's stock page carries a daily-chart JSON object inline
 * in the HTML, so we scrape `lastClose`/`lastDate` from it. US listings only
 * (finviz prices in USD; a non-US ticker like "TRN" would resolve to the US
 * company of that symbol, so this provider is never routed for non-US ISINs).
 *
 * The parse half is PURE + unit-tested; `fetchFinvizQuote` is the thin I/O
 * shell. One request per symbol (~300 KB HTML), polite spacing handled by the
 * refresh orchestrator.
 */
import type { InstrumentMeta, InstrumentRef, QuoteProvider, QuoteResult } from "../types";

const QUOTE_ENDPOINT = "https://finviz.com/quote.ashx";

const FINVIZ_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const REQUEST_TIMEOUT_MS = 10_000;
// Finviz rate-limits our Vercel data-center IP after a short burst (~5 rapid
// requests → the rest 4xx). Space consecutive requests out and retry once on a
// throttle so a whole US portfolio prices in one refresh pass.
const MIN_GAP_MS = 1_200;
const RETRY_BACKOFF_MS = 2_500;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let lastFetchAt = 0;
async function spaceRequests(): Promise<void> {
  const wait = lastFetchAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract the EOD close from a finviz stock page for `requestedSymbol`.
 * Validates the daily-chart object's ticker so a wrong/empty page (finviz
 * serves a generic page for an unknown ticker) is never cached. Returns null
 * on any mismatch or missing field.
 */
export function parseFinvizQuote(html: string, requestedSymbol: string): QuoteResult | null {
  if (!html || !requestedSymbol) return null;
  const sym = escapeRegex(requestedSymbol.toUpperCase());

  // Anchor on the daily chart object for THIS ticker: {"...","ticker":"SYM","timeframe":"d",...}
  const anchor = new RegExp(`"ticker":"${sym}","timeframe":"d"`, "i").exec(html);
  if (!anchor) return null;
  const scope = html.slice(anchor.index, anchor.index + 20_000);

  const closeM = /"lastClose":(-?\d+(?:\.\d+)?)/.exec(scope);
  const dateM = /"lastDate":(\d{8})/.exec(scope);
  if (!closeM || !dateM) return null;

  const close = Number(closeM[1]);
  if (!Number.isFinite(close) || close <= 0) return null;

  const d = dateM[1];
  const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return { close: close.toFixed(2), currency: "USD", date, source: "FINVIZ" };
}

/**
 * Fetch + parse one US symbol's EOD close from finviz. Spaces requests to stay
 * under finviz's data-center-IP burst limit, and retries once (after a longer
 * backoff) on a throttle response. Any failure → null.
 */
export async function fetchFinvizQuote(symbol: string): Promise<QuoteResult> {
  if (!symbol) return null;
  const url = `${QUOTE_ENDPOINT}?t=${encodeURIComponent(symbol)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    await spaceRequests();
    try {
      const res = await fetch(url, {
        headers: FINVIZ_HEADERS,
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) return parseFinvizQuote(await res.text(), symbol);
      // Throttled (429/503/403) → back off past the rate window and retry once.
      if (attempt === 0 && [429, 503, 403].includes(res.status)) {
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

export const finvizProvider: QuoteProvider = {
  id: "finviz",
  fetchQuote(ref: InstrumentRef, _meta: InstrumentMeta | null = null): Promise<QuoteResult> {
    return fetchFinvizQuote(ref.symbol);
  },
};
