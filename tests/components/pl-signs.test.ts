import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Issue #1 regression guard.
 *
 * Widget P/L values carry their direction in colour (`text-mint` gain /
 * `text-bad` loss), not in a `+`/`−` prefix. The signs were reintroduced by
 * hand at a dozen sites before, so scan the sources rather than trust review.
 *
 * `.tsx` files can't be rendered here (vitest runs node-environment and only
 * collects `.test.ts`), so this asserts on component source text — same
 * approach as tests/auth/copy.test.ts.
 */

const ROOT = path.resolve(__dirname, "../..");

/**
 * Files that are allowed to keep a sign, with the reason. Each one is a
 * deliberate exception, not an oversight:
 */
const ALLOWED = new Map<string, string>([
  [
    "src/components/pulse/tax-buckets-card.tsx",
    "The §20 Abs. 6 pots are a ledger: the signs are arithmetic operators " +
      "(gains + / Verlustvortrag − / Pauschbetrag −), not gain-loss decoration. " +
      "Dropping them would make 'Sparer-Pauschbetrag used €801' read as income.",
  ],
  [
    "src/components/pulse/loss-harvest-panel.tsx",
    "Prose inside a title= tooltip, which carries no colour — a signless " +
      "'Position is €120 overall' would be ambiguous.",
  ],
]);

/**
 * Patterns that prepend a `+` to a rendered value.
 *
 * Only the plus is forbidden. A bare `−` on a negative is the `fmtEur`
 * family's own idiom for uncoloured amounts, so matching it would flag
 * correct code (e.g. the local price formatter in position-detail-panel).
 */
const SIGN_PATTERNS = [
  /\?\s*"\+"/,
  /:\s*"\+"/,
  /"\+€"/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("P/L widgets carry direction in colour, not in a sign", () => {
  const files = [
    ...walk(path.join(ROOT, "src/components/pulse")),
    ...walk(path.join(ROOT, "src/app/(app)")),
  ];

  it("scans a non-trivial number of widget sources", () => {
    // Guards against the walk silently matching nothing after a move.
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(files.map((f) => path.relative(ROOT, f)))("%s renders no + prefix", (rel) => {
    if (ALLOWED.has(rel)) return;
    const src = readFileSync(path.join(ROOT, rel), "utf8");
    const hits = SIGN_PATTERNS.filter((p) => p.test(src)).map(String);
    expect(hits, `${rel} prepends a + to a value — colour it instead, or document it in ALLOWED`).toEqual([]);
  });

  it("keeps every allow-listed exception real", () => {
    for (const rel of ALLOWED.keys()) {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      const matched = SIGN_PATTERNS.some((p) => p.test(src));
      expect(matched, `${rel} no longer needs its exception — drop it from ALLOWED`).toBe(true);
    }
  });
});

describe("the shared formatters keep the two families apart", () => {
  it("offers a signless P/L formatter and a signed plain one", () => {
    const src = readFileSync(path.join(ROOT, "src/lib/format.ts"), "utf8");
    expect(src).toMatch(/export function fmtPl\(/);
    expect(src).toMatch(/export function fmtPlNative\(/);
    // The old opt-in `sign` flag is what let callers reintroduce a `+`.
    expect(src).not.toMatch(/sign\?:\s*boolean/);
  });
});
