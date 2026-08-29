import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { middleware, config as middlewareConfig } from "@/middleware";

/**
 * SEO issue #2 — `/` used to be the dashboard, so `(app)/layout.tsx`'s
 * `requireCurrentUser()` answered every anonymous request (crawlers
 * included) with a 307 to `/sign-in`. The root URL now belongs to a
 * statically prerendered marketing page and the dashboard has moved to
 * `/dashboard`.
 *
 * Two kinds of assertion live here. The middleware behaviour is exercised
 * for real (`NextRequest` in, `NextResponse` out). The routing/static
 * guarantees are structural — which files exist, and what they may not
 * contain — because this repo's Vitest runs in a node environment with no
 * DOM (see `tests/auth/copy.test.ts:6-29` for the same trade-off) and the
 * end-to-end 200/`x-nextjs-prerender` check belongs to a deployed URL,
 * not a unit test.
 */
const repoRoot = path.resolve(__dirname, "../..");
const readSrc = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

/**
 * The "this file must not contain X" assertions below are about shipped
 * code, not prose. Several of the files under test explain in a
 * doc-comment exactly which API they deliberately do *not* call, so
 * scanning the raw source would flag its own rationale.
 */
const readCode = (rel: string) =>
  readSrc(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const MARKETING_PAGE = "src/app/(marketing)/page.tsx";
const DASHBOARD_PAGE = "src/app/(app)/dashboard/page.tsx";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    out.push(path.relative(repoRoot, full).split(path.sep).join("/"));
  }
  return out;
}

const SRC_FILES = walk(path.join(repoRoot, "src"));

describe("`/` is a public page, not a redirect to the auth screen", () => {
  it("is owned by a `(marketing)` route group", () => {
    expect(existsSync(path.join(repoRoot, MARKETING_PAGE))).toBe(true);
  });

  it("is no longer owned by the authenticated `(app)` group", () => {
    // A `page.tsx` directly under `(app)` would put the session-gated
    // layout back on `/` and reinstate the 307 this issue removed.
    expect(existsSync(path.join(repoRoot, "src/app/(app)/page.tsx"))).toBe(false);
  });

  it("renders on the server without reading the session or any dynamic API", () => {
    const page = readCode(MARKETING_PAGE);
    expect(page).not.toMatch(/"use client"/);
    expect(page).not.toMatch(/requireCurrentUser|getCurrentUser|auth\.api|getSession/);
    expect(page).not.toMatch(/\bfrom "next\/headers"/);
  });

  it("declares `force-static`, so a later dynamic read fails the build instead of silently de-optimising it", () => {
    expect(readSrc(MARKETING_PAGE)).toContain('export const dynamic = "force-static"');
  });

  it("offers a crawlable link to the auth screen", () => {
    const page = readSrc(MARKETING_PAGE);
    expect(page).toContain('href="/sign-in"');
    expect(page).toContain('from "next/link"');
  });
});

describe("the dashboard moved to /dashboard and kept its guard", () => {
  it("lives under the `(app)` group, so the auth gate still wraps it", () => {
    expect(existsSync(path.join(repoRoot, DASHBOARD_PAGE))).toBe(true);
    expect(readSrc("src/app/(app)/layout.tsx")).toContain("requireCurrentUser()");
    expect(readSrc(DASHBOARD_PAGE)).toContain("requireCurrentUser()");
  });

  it("is where every in-app pointer at 'the dashboard' now goes", () => {
    // Exhaustive rather than per-file: a nav item or post-sign-in redirect
    // added later cannot quietly point back at `/` and land the user on
    // the marketing page.
    const offenders = SRC_FILES.filter((f) => f !== MARKETING_PAGE).flatMap((f) => {
      const text = readCode(f);
      const hits = [
        /window\.location\.href = "\/"/,
        /router\.push\("\/"/,
        /redirect\("\/"\)/,
        /callbackURL: "\/"/,
        /href: "\/",/,
      ].filter((re) => re.test(text));
      return hits.length > 0 ? [f] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("marks the nav item active for the whole /dashboard segment", () => {
    for (const nav of ["src/components/pulse/topbar-nav.tsx", "src/components/pulse/bottom-nav.tsx"]) {
      expect(readSrc(nav)).toContain('href: "/dashboard"');
      expect(readSrc(nav)).toContain('p.startsWith("/dashboard")');
    }
  });
});

describe("/sign-in is a focused auth screen", () => {
  const signIn = readSrc("src/app/sign-in/page.tsx");

  it("still renders the sign-in / create-account entry point", () => {
    expect(signIn).toMatch(/<AuthModalTrigger\b/);
  });

  it("no longer re-authors the landing page's marketing copy", () => {
    // Two URLs carrying the same hero would split the ranking signal and
    // give us two places to keep in sync.
    for (const phrase of [
      "Your German tax draft.",
      "One unified portfolio",
      "§22 staking",
      "What you",
      "BROKER_SUMMARIES",
    ]) {
      expect(signIn).not.toContain(phrase);
      expect(readSrc(MARKETING_PAGE)).toContain(phrase);
    }
  });
});

describe("the landing page does not re-author broker instructions (design §7.1)", () => {
  const page = readCode(MARKETING_PAGE);

  it("renders the copy module's summaries rather than its own list", () => {
    expect(page).toContain("BROKER_SUMMARIES");
    expect(page).toContain('from "@/lib/onboarding/broker-instructions"');
  });

  it("contains no menu path of its own", () => {
    // An arrow with words on either side is a hand-typed navigation chain —
    // the `Reports → Activity` that named a menu IBKR does not have. The
    // separator the renderer joins with (`" \u2192 "`) has no word character
    // adjacent to the arrow, so it does not trip this.
    expect(page).not.toMatch(/[A-Za-z0-9)]\s*(?:\u2192|&rarr;|->)\s*[A-Za-z0-9(]/);
  });

  it("leaves the fenced instruction phrases to the copy module", () => {
    // These are fenced to `broker-instructions.ts` as their sole authoring
    // site by `tests/onboarding/copy.test.ts`. Importing them is the point;
    // retyping them here would pass that fence's file-level check only by
    // accident of wording, which is what design §7.1 rejected.
    for (const phrase of ["Performance &", "Activity Statement", "All time", "Portfolios", "view only"]) {
      expect(page).not.toContain(phrase);
    }
  });
});

describe("the landing page's data-handling claims are substantiated (design §7.2)", () => {
  const page = readSrc(MARKETING_PAGE);

  it("makes no blanket claim that nothing is sent before sign-in", () => {
    // `src/app/layout.tsx` mounts `<Analytics />` in the root layout, which
    // this route group inherits — an anonymous visitor reading the trust line
    // has already sent a pageview. Any wording implying otherwise is false on
    // the very page that carries it.
    expect(page).not.toMatch(/leaves your browser/i);
    expect(page).not.toMatch(/no data (is )?(sent|leaves|transmitted)/i);
  });

  it("still says the substantiated part: the statement itself is parsed client-side", () => {
    // True — `upload-dropzone.tsx` parses in a Web Worker via
    // `parseStatementInWorker` and POSTs only the parsed result.
    expect(page).toMatch(/parsed in your browser/i);
    expect(page).toMatch(/never uploaded/i);
  });

  it("names the position snapshot, not just the events", () => {
    // `upload-dropzone.tsx:69` POSTs `snapshotQuotes` alongside `events`, and
    // `src/lib/imports/ingest.ts:225-228` persists them into `quote_cache`.
    // That is the statement's holdings and their closing prices — a category
    // no reader would infer from "events plus file metadata", so a page that
    // enumerates what is sent has to name it rather than imply it away.
    expect(page).toMatch(/position snapshot/i);
    expect(page).toMatch(/holdings/i);
  });

  it("does not claim events are the only thing stored", () => {
    // The POST body also carries fileName, a SHA-256 hash, accountNumber,
    // baseCurrency and a date range, all persisted.
    expect(page).not.toMatch(/only normali[sz]ed events/i);
  });
});

describe("the landing page's tax copy meets the legal-correctness standard", () => {
  const page = readSrc(MARKETING_PAGE);

  it("never puts the §22 Freigrenze figure on a page whose only threshold context is §23", () => {
    // The shipped copy read "the 365-day cliff for long-term tax-free gains
    // and the €256 Freigrenze" — one continuous §23 sentence with the §22
    // Nr. 3 number bolted on. €256 is § 22 Abs. 3 Satz 2 EStG; §23's figure is
    // €1 000 (§ 23 Abs. 3 Satz 5). This page's own product implements the
    // split correctly — `src/lib/tax/anlage-so.ts:28` defines
    // FREIGRENZE_22_EUR = 256 and `:33-35` returns 1000/600 for §23, with a
    // module header that says in as many words not to sum them into one
    // threshold. A reader taking the old sentence at face value understates
    // their §23 allowance by €744.
    //
    // The fence is the bare digits rather than "€256": §23 is the only
    // threshold context this page has, so there is no correct reason for the
    // number to appear here at all, and a fence on the euro-signed form would
    // be walked around by the next rewrite.
    expect(page).not.toContain("256");
  });

  it("states the holding period the way the statute does, not as a day count", () => {
    // § 23 Abs. 1 Satz 1 Nr. 2 EStG says "nicht mehr als ein Jahr"; BMF v.
    // 06.03.2025 Rn. 55 calls it the Jahresfrist. A year is not 365 days
    // across a leap day, so a day count on a page held to this standard is a
    // needless hostage.
    expect(page).not.toMatch(/365[\s-]*day/i);
    expect(page).not.toMatch(/\b365\b/);
  });

  it("does not tell an anonymous reader whether they owe tax", () => {
    // BMF v. 06.03.2025 Rn. 45: the §22 Nr. 3 Freigrenze counts staking income
    // "zusammen mit anderen Einkünften aus Leistungen" — aggregated with every
    // other Leistung the taxpayer had that year. This app sees Coinbase
    // staking and nothing else, so it cannot know. Design §8/Q4 prohibition 6
    // also bars a legal conclusion in tax-adjacent copy.
    expect(page).not.toMatch(/whether you owe/i);
    expect(page).not.toMatch(/you owe (anything|tax)/i);
  });

  it("does not promise ELSTER Zeile numbers for Anlage SO", () => {
    // `src/lib/tax/elster-fields.ts` defines KAP_* and KAP_INV_* keys only —
    // there is no SO field key, and `src/lib/tax/export-pdf-so.tsx` directs
    // the user by box name rather than printing a Zeile. A card titled
    // "Anlage KAP + Anlage SO" promising "the Z-line numbers you type into
    // ELSTER" advertises an output the app does not produce, on the one form
    // where a wrong line number lands in a filed return.
    expect(page).not.toMatch(/Z-line/i);
    expect(page).toMatch(/Anlage KAP \/ KAP-INV/);
  });

  it("carries the Steuerberater disclaimer every other tax surface carries", () => {
    // `export-pdf.tsx:115` and `:238`, `export-pdf-so.tsx:155` and the in-app
    // anlage-so page `:191` all caveat their figures. This is the most public
    // tax-adjacent surface in the product and the only one a stranger reads
    // first, so it inherits the convention rather than being the exception.
    // Whitespace-tolerant: this reads the raw source, where the sentence is
    // wrapped across two JSX lines that the renderer collapses to one space.
    expect(page).toMatch(/not a certified tax filing/i);
    expect(page).toMatch(/not tax\s+advice/i);
    expect(page).toMatch(/Steuerberater/);
  });
});

describe("middleware keeps signed-in visitors off the landing page", () => {
  function request(url: string, cookie?: string) {
    return new NextRequestLike(url, cookie);
  }

  it("lets an anonymous request through to the prerendered page", () => {
    const res = middleware(request("https://ptfolio.net/") as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects a request carrying a session cookie to /dashboard", () => {
    const res = middleware(
      request("https://ptfolio.net/", "better-auth.session_token=abc.def") as never,
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://ptfolio.net/dashboard");
  });

  it("recognises the production `__Secure-` cookie name too", () => {
    const res = middleware(
      request("https://ptfolio.net/", "__Secure-better-auth.session_token=abc.def") as never,
    );
    expect(res.headers.get("location")).toBe("https://ptfolio.net/dashboard");
  });

  it("ignores unrelated cookies", () => {
    const res = middleware(request("https://ptfolio.net/", "theme=dark") as never);
    expect(res.status).toBe(200);
  });

  it("runs on `/` and nothing else", () => {
    expect(middlewareConfig.matcher).toBe("/");
  });

  it("is not an auth gate — it never validates the token (CVE-2025-29927 class)", () => {
    const src = readCode("src/middleware.ts");
    expect(src).not.toMatch(/auth\.api|getSession\(|@\/lib\/db|@\/lib\/auth\/setup/);
    expect(src).toContain("getSessionCookie");
  });
});

/**
 * `middleware()` only needs `.url` and `.headers` from its argument, and
 * constructing a real `NextRequest` drags in Next's request internals for
 * no added coverage. This is the smallest shape that exercises the real
 * `getSessionCookie` cookie parsing.
 */
class NextRequestLike {
  readonly url: string;
  readonly headers: Headers;

  constructor(url: string, cookie?: string) {
    this.url = url;
    this.headers = new Headers(cookie ? { cookie } : {});
  }
}
