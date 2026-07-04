import { NextResponse } from "next/server";
import { hasValidCronSecret } from "@/lib/auth/cron";

/**
 * THROWAWAY DIAGNOSTIC — decides the market-data provider architecture.
 *
 * The one thing we can't test from a dev machine is whether Vercel's
 * datacenter egress IPs (fra1) are blocked by the sites we want to scrape.
 * Yahoo's HTML + JSON are known-blocked (see externally-priced.ts); justETF,
 * Google Finance and Stockopedia are unverified. This route fetches each
 * candidate — HTML pages AND the clean JSON APIs — from within a Vercel
 * function and reports status, redirects, timing and whether the target
 * datum is actually extractable. Delete once the provider choice is locked.
 *
 * Gated by CRON_SECRET (same as the cron routes) so it isn't world-open.
 * Fetches only public pages and returns only public data.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

type Probe = {
  label: string;
  url: string;
  kind: "html" | "json";
  /** Regexes tried against the body; first match's group 1 is reported. */
  extract?: { name: string; patterns: RegExp[] }[];
  /** Substrings whose presence flags a block/consent/paywall wall. */
  wallMarkers?: string[];
};

const PROBES: Probe[] = [
  {
    label: "justetf_profile_html",
    url: "https://www.justetf.com/en/etf-profile.html?isin=IE00B0M63177",
    kind: "html",
    extract: [
      { name: "name", patterns: [/data-testid="etf-profile-header_etf-name"[^>]*>([^<]+)/] },
      { name: "distributionPolicy", patterns: [/data-testid="tl_etf-basics_value_distribution-policy"[^>]*>([^<]+)/] },
      { name: "teilfreistellung", patterns: [/(\d+)\s*%\s*tax rebate/] },
    ],
    // 302 → /search.html means "not an ETF"; a real profile is 200.
    wallMarkers: ["Datenschutzeinstellungen", "unusual traffic", "captcha"],
  },
  {
    label: "justetf_quote_json",
    url: "https://www.justetf.com/api/etfs/IE00B0M63177/quote?locale=en&currency=EUR",
    kind: "json",
    extract: [{ name: "latestQuote", patterns: [/"latestQuote":\{"raw":([\d.]+)/] }],
  },
  {
    label: "google_finance_html",
    url: "https://www.google.com/finance/beta/quote/TRN:LON",
    kind: "html",
    extract: [
      { name: "price", patterns: [/GBX\s*([\d.,]+)/, /class="YMlKec fxKbKc"[^>]*>([^<]+)/] },
      { name: "peRatio", patterns: [/P\/E ratio<\/div>[\s\S]{0,80}?([\d.]+)/, />P\/E ratio\s*([\d.]+)/] },
    ],
    wallMarkers: ["unusual traffic", "captcha", "consent.google.com", "sorry/index"],
  },
  {
    label: "stockopedia_html",
    url: "https://www.stockopedia.com/share-prices/trainline-LON:TRN/",
    kind: "html",
    extract: [
      { name: "price", patterns: [/og:description" content="[^"]*?([\d.]+p)\b/, /share price:\s*([\d.]+p)/] },
    ],
    wallMarkers: ["Access denied", "captcha", "Just a moment", "cf-browser-verification"],
  },
  {
    label: "yahoo_quote_html",
    url: "https://finance.yahoo.com/quote/TRN.L/",
    kind: "html",
    extract: [{ name: "price", patterns: [/data-testid="qsp-price"[^>]*>([\d.,]+)/] }],
    wallMarkers: ["Datenschutzeinstellungen", "consent.yahoo.com", "guce.yahoo.com"],
  },
  {
    label: "yahoo_search_json",
    url: "https://query2.finance.yahoo.com/v1/finance/search?q=GB00BKDTK925&quotesCount=6&newsCount=0",
    kind: "json",
    extract: [
      { name: "primarySymbol", patterns: [/"symbol":"([^"]+)"/] },
      { name: "sector", patterns: [/"sectorDisp":"([^"]+)"/] },
    ],
  },
  {
    label: "yahoo_chart_json",
    url: "https://query1.finance.yahoo.com/v8/finance/chart/TRN.L?interval=1d&range=5d",
    kind: "json",
    extract: [{ name: "regularMarketPrice", patterns: [/"regularMarketPrice":([\d.]+)/] }],
  },
];

async function runProbe(p: Probe) {
  const started = Date.now();
  try {
    const res = await fetch(p.url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "User-Agent": UA,
        Accept:
          p.kind === "json"
            ? "application/json,text/plain,*/*"
            : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const status = res.status;
    const location = res.headers.get("location");
    const redirectedToSearch = !!location && /search\.html/.test(location);

    // Read at most 1 MB so a huge HTML body can't blow the function memory.
    const body = (await res.text()).slice(0, 1_000_000);
    const bytes = body.length;

    const wallHit = (p.wallMarkers ?? []).find((m) => body.includes(m)) ?? null;

    const extracted: Record<string, string | null> = {};
    for (const field of p.extract ?? []) {
      let value: string | null = null;
      for (const rx of field.patterns) {
        const m = body.match(rx);
        if (m) {
          value = m[1].trim();
          break;
        }
      }
      extracted[field.name] = value;
    }

    const reachable = status >= 200 && status < 400 && !wallHit;
    return {
      label: p.label,
      url: p.url,
      status,
      location,
      redirectedToSearch,
      bytes,
      elapsedMs: Date.now() - started,
      wallHit,
      extracted,
      reachable,
    };
  } catch (e) {
    return {
      label: p.label,
      url: p.url,
      status: 0,
      location: null,
      redirectedToSearch: false,
      bytes: 0,
      elapsedMs: Date.now() - started,
      wallHit: null,
      extracted: {},
      reachable: false,
      error: (e as Error).name + ": " + (e as Error).message,
    };
  }
}

export async function GET(req: Request) {
  if (!hasValidCronSecret(req)) {
    return new Response("unauthorized", { status: 401 });
  }

  // Sequential + spaced — this is a courtesy probe, not a load test.
  const results = [];
  for (const p of PROBES) {
    results.push(await runProbe(p));
    await new Promise((r) => setTimeout(r, 800));
  }

  return NextResponse.json(
    {
      ranAt: new Date().toISOString(),
      region: process.env.VERCEL_REGION ?? "unknown",
      summary: Object.fromEntries(results.map((r) => [r.label, r.reachable])),
      results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
