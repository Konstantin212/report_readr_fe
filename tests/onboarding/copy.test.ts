import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The onboarding-clarity ACs are largely UI-copy and markup-structure
 * requirements ("this string appears in exactly one authoring site", "the
 * disclosure trigger is outside the <label>"). This repo has no
 * DOM-rendering test setup (`vitest.config.ts` runs in `environment:
 * "node"`, no jsdom/happy-dom, no @testing-library/react) and `.tsx` files
 * are not even collected by the Vitest `include` glob, so the assertions
 * below run against the source text rather than a rendered DOM — the same
 * deliberate, narrower substitute documented at length in
 * `tests/auth/copy.test.ts:6-29`.
 *
 * What this file does and does not prove:
 *  - It DOES prove the words regressed or did not regress, that a given
 *    sentence has exactly one authoring site, and that the structural
 *    choices carrying AC-OC2.3/AC-OC2.10 (native <button> with
 *    `aria-expanded`, disclosure state local to the leaf, trigger rendered
 *    outside the file-picker <label>) are still in place.
 *  - It does NOT prove the disclosure renders, that `aria-expanded` flips at
 *    runtime, or that clicking the trigger does not open the file picker.
 *    Those need a DOM. Everything the AC can be asserted on *directly* —
 *    the copy itself, the first-run predicate, the tour's next-action and
 *    destination — lives in plain `.ts` modules and is covered by real unit
 *    tests in this directory (`broker-instructions.test.ts`,
 *    `first-run.test.ts`, `tour-next-action.test.ts`); only the residue is
 *    here.
 *
 * Recommendation for `tester`/future test-tooling investment: adding
 * `jsdom` + `@testing-library/react`, or a Playwright e2e on `/upload`
 * (activate trigger → `aria-expanded="true"` → "Flex Query" visible → no
 * file dialog), would close that residual gap. Flagged rather than silently
 * skipped.
 */
const repoRoot = path.resolve(__dirname, "../..");
const srcRoot = path.join(repoRoot, "src");

const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

function walkSrc(dir: string = srcRoot): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkSrc(full));
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs|css)$/.test(entry)) continue;
    out.push({ path: path.relative(repoRoot, full).split(path.sep).join("/"), text: readFileSync(full, "utf8") });
  }
  return out;
}

const SRC_FILES = walkSrc();

function filesContaining(needle: string | RegExp): string[] {
  const test = typeof needle === "string" ? (t: string) => t.includes(needle) : (t: string) => needle.test(t);
  return SRC_FILES.filter((f) => test(f.text)).map((f) => f.path);
}

function readSrc(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const COPY_MODULE = "src/lib/onboarding/broker-instructions.ts";

describe("AC-OC0.2 / AC-OC2.7: instruction prose has exactly one authoring site", () => {
  for (const sentence of ["Flex Query", "entire contents", "All time", "CSV exports drop fields"]) {
    it(`"${sentence}" is authored only in the shared copy module`, () => {
      expect(filesContaining(sentence)).toEqual([COPY_MODULE]);
    });
  }

  it("both consumers render the shared body rather than their own prose", () => {
    const tour = readSrc("src/components/onboarding/welcome-tour.tsx");
    const disclosure = readSrc("src/components/pulse/export-instructions.tsx");
    expect(tour).toContain("InstructionBody");
    expect(disclosure).toContain("InstructionBody");
  });
});

describe("AC-OC1.3: the key + secret wording is gone from the codebase", () => {
  it("no file under src/ tells the user to copy a key + secret pair", () => {
    expect(filesContaining("Copy the key + secret")).toEqual([]);
    expect(filesContaining("Paste them")).toEqual([]);
  });
});

describe("AC-OC1.5 / AC-OC1.7: in-app copy deep-links the crypto settings section", () => {
  it("the tour's ReadyCard links to the crypto section", () => {
    const tour = readSrc("src/components/onboarding/welcome-tour.tsx");
    expect(tour).toContain("/settings?section=crypto");
    expect(tour).not.toContain('router.push("/settings")');
  });

  it("the tour navigates via tourDestination rather than a hard-coded push", () => {
    const tour = readSrc("src/components/onboarding/welcome-tour.tsx");
    expect(tour).toContain("tourDestination");
    expect(tour).toContain("tourNextAction");
  });

  it("the crypto page empty state links to the crypto section, not bare /settings", () => {
    const cryptoPage = readSrc("src/app/(app)/crypto/page.tsx");
    expect(cryptoPage).toContain("/settings?section=crypto");
    expect(cryptoPage).not.toContain('href="/settings"');
  });

  it("'crypto' is a real settings section, so the deep link resolves (AC-OC1.6)", () => {
    expect(readSrc("src/components/pulse/settings-sidebar.tsx")).toContain('key: "crypto"');
    expect(readSrc("src/app/(app)/settings/page.tsx")).toContain('section === "crypto"');
  });
});

describe("AC-OC1.8: the Settings → Crypto empty state renders the shared paste sentence", () => {
  const manager = readSrc("src/components/pulse/crypto-accounts-manager.tsx");

  it("renders coinbasePasteInstruction instead of its own wording", () => {
    expect(manager).toContain('coinbasePasteInstruction("on-settings-crypto-page")');
  });

  it("leaves the separate revocation note about portal.cdp.coinbase.com untouched", () => {
    expect(manager).toContain("to fully revoke.");
  });
});

describe("AC-OC2.1–2.3: the /upload disclosure is always reachable and accessible", () => {
  const disclosure = readSrc("src/components/pulse/export-instructions.tsx");

  it("is a native, keyboard-operable button that announces its state", () => {
    expect(disclosure).toContain('type="button"');
    expect(disclosure).toContain("aria-expanded");
    expect(disclosure).toContain("aria-controls");
  });

  it("starts collapsed", () => {
    expect(disclosure).toContain("useState(false)");
  });

  it("does not gate its visibility on localStorage or prior imports", () => {
    expect(disclosure).not.toContain("localStorage");
    expect(disclosure).not.toContain("tour_dismissed");
  });

  it("is mounted on the upload page itself", () => {
    expect(readSrc("src/components/pulse/upload-dropzone.tsx")).toContain("<ExportInstructions");
  });
});

describe("AC-OC2.10: the disclosure cannot disturb the upload flow", () => {
  it("renders outside the <label> that wraps the hidden file input", () => {
    const dropzone = readSrc("src/components/pulse/upload-dropzone.tsx");
    expect(dropzone.indexOf("<ExportInstructions")).toBeGreaterThan(dropzone.indexOf("</label>"));
  });

  it("owns no upload state and touches no queue internals", () => {
    const disclosure = readSrc("src/components/pulse/export-instructions.tsx");
    expect(disclosure).not.toContain("upload-queue");
    expect(disclosure).not.toContain("addFiles");
    expect(disclosure).not.toContain("setQueue");
    expect(disclosure).not.toContain("setProcessing");
  });
});

describe("AC-OC2.9: Revolut copy is byte-identical", () => {
  const dropzone = readSrc("src/components/pulse/upload-dropzone.tsx");

  it("keeps the two Revolut blocks exactly as they were", () => {
    expect(dropzone).toContain(`        <div className="text-muted text-sm mt-2">
          Freedom Finance JSON, Interactive Brokers Activity CSV, or Revolut XLSX — drop
          several at once. Parsed locally on your device.
        </div>
        <div className="text-muted text-xs mt-1">
          For Revolut, upload all three exports: savings statement, trading account
          statement and trading P&amp;L. The P&amp;L is the only one carrying dividends
          gross of withholding tax, which German tax reporting needs.
        </div>`);
  });

  it("adds no further Revolut mentions", () => {
    expect(dropzone.match(/Revolut/g)).toHaveLength(2);
  });

  it("keeps Revolut out of the new disclosure", () => {
    expect(readSrc("src/components/pulse/export-instructions.tsx")).not.toMatch(/revolut/i);
    expect(readSrc(COPY_MODULE)).not.toMatch(/revolut/i);
  });
});

describe("AC-OC3.2–3.5: the dashboard first-run branch", () => {
  const dashboard = readSrc("src/app/(app)/page.tsx");

  it("returns the first-run card early, so no zero-valued widget renders", () => {
    expect(dashboard).toContain("isFirstRun(");
    expect(dashboard).toContain("return <FirstRunCard />;");
    expect(dashboard.indexOf("return <FirstRunCard />;")).toBeLessThan(dashboard.indexOf("Portfolio value"));
  });

  it("derives the signal from the existing import count and crypto summary", () => {
    expect(dashboard).toContain("getImportCount(user.id)");
    expect(dashboard).toContain("hasCryptoAccounts: crypto.hasAccounts");
  });

  it("memoizes getImportCount so the layout and the page share one query", () => {
    const imports = readSrc("src/lib/data/imports.ts");
    expect(imports).toContain('from "react"');
    expect(imports).toContain("cache(");
  });

  it("offers both a statement CTA and a Coinbase CTA, plus the way back to the tour", () => {
    const card = readSrc("src/components/onboarding/first-run-card.tsx");
    expect(card).toContain('href="/upload"');
    expect(card).toContain('href="/settings?section=crypto"');
    expect(card).toContain("in the top bar");
  });

  it("never reads localStorage, so it co-exists with the tour (AC-OC3.7)", () => {
    expect(readSrc("src/components/onboarding/first-run-card.tsx")).not.toContain("localStorage");
    expect(readSrc("src/components/onboarding/first-run-card.tsx")).not.toContain('"use client"');
  });

  it("no longer claims a background backfill is running (AC-OC3.5)", () => {
    expect(filesContaining("history backfilling")).toEqual([]);
    expect(filesContaining(/backfill/i).filter((p) => p.startsWith("src/app/(app)/page.tsx"))).toEqual([]);
    expect(dashboard).toContain("No performance history yet.");
  });
});

describe("AC-OC4.1–4.3: the welcome card is public-appropriate", () => {
  const tour = readSrc("src/components/onboarding/welcome-tour.tsx");

  it("no file under src/ claims restricted access (AC-OC4.1)", () => {
    expect(filesContaining(/friends-only/i)).toEqual([]);
    expect(filesContaining(/invite-only|invitation only/i)).toEqual([]);
  });

  it("makes no claim about scale, user count or company status (AC-OC4.2)", () => {
    expect(tour).toContain("This is a portfolio + German tax tool.");
  });

  it("leaves the rest of the welcome card unchanged (AC-OC4.3)", () => {
    expect(tour).toContain("stocks, ETFs, bonds, dividends and crypto");
    expect(tour).toContain("<b>Anlage KAP</b> and <b>Anlage SO</b>");
    expect(tour).toContain("in the top bar");
  });
});

describe("AC-OC0.3: no tax surface is touched", () => {
  it("no onboarding module imports from the tax or ledger layer", () => {
    const onboardingFiles = SRC_FILES.filter(
      (f) => f.path.includes("/onboarding/") || f.path.endsWith("export-instructions.tsx"),
    );
    expect(onboardingFiles.length).toBeGreaterThan(0);
    for (const f of onboardingFiles) {
      expect(f.text).not.toMatch(/from "@\/lib\/(tax|ledger)/);
    }
  });
});

describe("AC-OC0.2 / AC-OC2.7: every distinctive instruction phrase, not just a sample", () => {
  // Each of these is a phrase a reader could plausibly copy-paste into a
  // second component. One authoring site each is the whole point of Item 2.
  for (const sentence of [
    "Client Portal",
    "Performance &",
    "Activity Statement",
    "Repeat for each year",
    "2017xx_…_all.json",
    "All time",
    "Portfolios",
    "view only",
    "text editor",
  ]) {
    it(`"${sentence}" is authored only in the shared copy module`, () => {
      // `platform-card.tsx` carries one-word broker taglines ("Activity
      // Statement CSV") predating this feature; it is not an instruction
      // surface and is out of scope, so it is excluded rather than rewritten.
      const owners = filesContaining(sentence).filter(
        (p) => p !== "src/components/onboarding/platform-card.tsx",
      );
      expect(owners).toEqual([COPY_MODULE]);
    });
  }

  // These phrases legitimately also appear in non-copy code (a REST client's
  // doc comment, the tax layer's §22 wording), so the fence is narrower: no
  // rendered surface may re-author them.
  for (const sentence of ["Coinbase Developer Platform", "staking income"]) {
    it(`"${sentence}" is not re-authored by any component or page`, () => {
      const rendered = filesContaining(sentence).filter(
        (p) => p.startsWith("src/components/") || p.startsWith("src/app/"),
      );
      expect(rendered.filter((p) => p.includes("/onboarding/"))).toEqual([]);
    });
  }

  it("'CDP Key JSON' exists only as the copy and the form label it names", () => {
    // Two sites on purpose: the instruction, and the <label> the instruction
    // points at. AC-OC0.1 requires those two to agree, which is asserted in
    // `broker-instructions.test.ts`; here we only fence off a third copy.
    expect(filesContaining("CDP Key JSON").sort()).toEqual([
      "src/components/pulse/crypto-accounts-manager.tsx",
      COPY_MODULE,
    ]);
  });

  it("no consumer re-authors an <ol> of export steps of its own", () => {
    for (const file of [
      "src/components/onboarding/welcome-tour.tsx",
      "src/components/pulse/export-instructions.tsx",
      "src/components/pulse/crypto-accounts-manager.tsx",
    ]) {
      expect(readSrc(file)).not.toContain("list-decimal");
    }
  });
});

describe("AC-OC2.1 / AC-OC2.2: the disclosure is unconditional and stays on the page", () => {
  const dropzone = readSrc("src/components/pulse/upload-dropzone.tsx");
  const disclosure = readSrc("src/components/pulse/export-instructions.tsx");

  it("is mounted unconditionally, so prior imports cannot hide it", () => {
    // Anything of the form `{recent.length > 0 && <ExportInstructions ...` or
    // a ternary would show up as a `{`-prefixed guard on the same line.
    const line = dropzone.split("\n").find((l) => l.includes("<ExportInstructions"))!;
    expect(line.trim()).toBe("<ExportInstructions />");
  });

  it("navigates nowhere and never reopens the tour modal", () => {
    expect(disclosure).not.toMatch(/useRouter|next\/link|router\.push|window\.location/);
    expect(disclosure).not.toMatch(/WelcomeTour|TourHost|forceOpen/);
  });

  it("toggles purely local state rather than a URL or storage flag", () => {
    expect(disclosure).toContain("setOpen((o) => !o)");
    expect(disclosure).not.toMatch(/searchParams|sessionStorage|localStorage/);
  });
});

describe("AC-OC3.3: the first-run card says what happened and what to do next", () => {
  const card = readSrc("src/components/onboarding/first-run-card.tsx");

  it("leads with a headline that states there is no data yet", () => {
    expect(card).toContain("Nothing here yet.");
  });

  it("explains that both ingest paths feed the page", () => {
    expect(card).toMatch(/broker statement/i);
    expect(card).toMatch(/Coinbase/);
  });

  it("words the primary CTA as uploading a statement", () => {
    const primary = card.slice(card.indexOf('href="/upload"'), card.indexOf('href="/settings'));
    expect(primary).toContain("Upload a statement");
  });
});

describe("AC-OC3.5: no surface claims a background job the app does not run", () => {
  const dashboard = readSrc("src/app/(app)/page.tsx");

  it("replaces the empty-curve copy with a neutral statement of fact", () => {
    expect(dashboard).toContain("No performance history yet.");
    expect(dashboard).not.toMatch(/backfill|in progress|syncing|will appear shortly|building/i);
  });

  it("leaves the performance page's real cron copy untouched", () => {
    // `/performance` is out of scope: that page IS backed by a nightly cron,
    // so its wording is accurate and must not be swept up by this change.
    expect(readSrc("src/app/(app)/performance/page.tsx")).toContain(
      "Not enough history yet. Cron will backfill within 24 hours.",
    );
  });

  it("leaves no onboarding surface claiming a background job at all", () => {
    // Elsewhere `backfill` names real cron/FX machinery, so a repo-wide ban
    // would be wrong. The claim AC-OC3.5 forbids is a *user-facing* one on the
    // surfaces this feature owns.
    const surfaces = SRC_FILES.filter(
      (f) => f.path.includes("/onboarding/") || f.path.endsWith("export-instructions.tsx"),
    );
    expect(surfaces.length).toBeGreaterThan(3);
    for (const f of surfaces) {
      expect(f.text).not.toMatch(/backfill|history is being|in progress/i);
    }
  });
});

describe("AC-OC4.4: no onboarding surface implies restricted access", () => {
  const ONBOARDING_SURFACES = SRC_FILES.filter(
    (f) =>
      f.path.includes("/onboarding/") ||
      f.path.endsWith("export-instructions.tsx") ||
      f.path.endsWith("src/app/sign-in/page.tsx"),
  );

  it("scans a non-empty set of surfaces", () => {
    expect(ONBOARDING_SURFACES.length).toBeGreaterThan(3);
  });

  for (const phrase of [
    /friends[- ]only/i,
    /invite[- ]only/i,
    /by invitation/i,
    /closed beta|private beta/i,
    /waitlist|wait list/i,
    /request access|early access/i,
  ]) {
    it(`no onboarding surface matches ${phrase}`, () => {
      expect(ONBOARDING_SURFACES.filter((f) => phrase.test(f.text)).map((f) => f.path)).toEqual([]);
    });
  }
});

describe("AC-OC1.7: every in-app pointer at the Coinbase connect form deep-links", () => {
  // Exhaustive rather than per-file: a fifth pointer added later cannot slip
  // through by simply not being named in a test.
  const SETTINGS_LINKS = SRC_FILES.flatMap((f) =>
    [...f.text.matchAll(/href="(\/settings[^"]*)"/g)].map((m) => ({ path: f.path, href: m[1] })),
  );

  it("finds the pointers it claims to check", () => {
    expect(SETTINGS_LINKS.length).toBeGreaterThanOrEqual(5);
  });

  it("targets the crypto section from every Coinbase-connect surface", () => {
    const cryptoSurfaces = SETTINGS_LINKS.filter(
      (l) =>
        l.path.includes("crypto") ||
        l.path.includes("/onboarding/") ||
        l.path.endsWith("welcome-tour.tsx"),
    );
    expect(cryptoSurfaces.length).toBeGreaterThanOrEqual(4);
    for (const link of cryptoSurfaces) {
      expect(link.href).toBe("/settings?section=crypto");
    }
  });

  it("leaves bare /settings only where it means the settings page generally", () => {
    // The topbar user menu is generic navigation, not a Coinbase pointer, so
    // it correctly lands on the default (brokers) section.
    expect(SETTINGS_LINKS.filter((l) => l.href === "/settings").map((l) => l.path)).toEqual([
      "src/components/pulse/user-menu.tsx",
    ]);
  });
});
