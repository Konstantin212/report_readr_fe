# ELSTER Field Registry + Emission Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ELSTER form itself the model, so that every emitted number
carries its real Zeile number, its verbatim German caption, its correct
precision and its correct sign — fixing the three defects that made a real
filing over-declare €3.611 of income.

**Architecture:** A pure, declarative registry (`elster-fields.ts`) describes
each Anlage KAP / KAP-INV line: caption, precision, sign policy, and how it
relates to other lines (`contained_in` for the form's *"zusätzlich / darin
enthaltene"* lines, `excluded_from` for its *"ausschließlich"* lines).
`german-tax.ts` emits through that registry instead of a hand-written
accumulator, and the PDF, the values card and the checklist read captions from
it instead of keeping three drifting copies.

**Tech Stack:** TypeScript, decimal.js, Vitest (node env, pure functions only —
no DB in tests), Next.js 15 App Router, React 19.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-elster-multi-scenario-support.md`.
- Evidence log: `docs/elster-anlage-kap-2025-gaps.md`. Every caption below was
  read off the live ELSTER 2025 form on 2026-07-19 — copy them **verbatim**,
  including the `§` spacing, or the whole point of the registry is lost.
- `buildKapAndKapInv` stays **pure**. No I/O, no `getDb`, no `Date.now()`.
- Money arithmetic uses `Decimal` throughout. Never `number` for amounts.
- Tests are pure-function only (repo convention). No DB, no mocks of drizzle.
- Run `pnpm typecheck && pnpm test && pnpm build` before every commit.
- Never commit broker statements or generated tax exports. They are gitignored;
  keep it that way.
- Goldens change in Task 3 and Task 4 only, deliberately, and each change must
  be justified in the commit message.

---

### Task 1: The field registry

**Files:**
- Create: `src/lib/tax/elster-fields.ts`
- Test: `tests/tax/elster-fields.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module, zero imports).
- Produces: `ElsterFieldKey`, `ElsterField`, `KAP_FIELDS`, `KAP_INV_FIELDS`,
  `ALL_ELSTER_FIELDS`, `fieldFor(key): ElsterField`,
  `containedChildren(parentKey): ElsterFieldKey[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tax/elster-fields.test.ts
import { describe, it, expect } from "vitest";
import {
  KAP_FIELDS,
  fieldFor,
  containedChildren,
  ALL_ELSTER_FIELDS,
} from "@/lib/tax/elster-fields";

describe("ELSTER field registry", () => {
  it("carries the verbatim caption for Zeile 19", () => {
    expect(fieldFor("KAP_Z19").caption).toBe(
      "Ausländische Kapitalerträge (ohne Beträge laut den Zeilen 26a und 52)",
    );
  });

  it("marks Zeile 19 as signed — a losing year is a negative total", () => {
    expect(fieldFor("KAP_Z19").sign).toBe("signed");
  });

  it("marks the breakout lines as non-negative magnitudes", () => {
    for (const k of ["KAP_Z20", "KAP_Z22", "KAP_Z23"] as const) {
      expect(fieldFor(k).sign).toBe("magnitude");
    }
  });

  it("knows 20/22/23 are contained in 19 (the form says 'darin enthaltene')", () => {
    expect(containedChildren("KAP_Z19").sort()).toEqual(
      ["KAP_Z20", "KAP_Z22", "KAP_Z23"].sort(),
    );
  });

  it("uses euro+cent precision for the tax-credit lines, whole euros for income", () => {
    expect(fieldFor("KAP_Z19").precision).toBe("whole_euro");
    expect(fieldFor("KAP_Z37").precision).toBe("euro_cent");
    expect(fieldFor("KAP_Z41").precision).toBe("euro_cent");
  });

  it("places Zeile 41 in section 8 — NOT 51/52, which are family-foundation fields", () => {
    const z41 = fieldFor("KAP_Z41");
    expect(z41.section).toBe(8);
    expect(z41.zeile).toBe("41");
    expect(z41.caption).toBe("Anrechenbare noch nicht angerechnete ausländische Steuern");
    expect(KAP_FIELDS.some((f) => f.zeile === "51" || f.zeile === "52")).toBe(false);
  });

  it("has no duplicate keys", () => {
    const keys = ALL_ELSTER_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tax/elster-fields.test.ts`
Expected: FAIL — `Cannot find module '@/lib/tax/elster-fields'`

- [ ] **Step 3: Write the registry**

```ts
// src/lib/tax/elster-fields.ts
/**
 * Declarative description of the ELSTER Anlage KAP / KAP-INV lines Folio
 * emits.
 *
 * WHY THIS EXISTS. Until 2026-07-19 the app carried Zeile numbers that had
 * been derived informally, and three copies of the German captions (PDF,
 * values card, checklist) that could drift apart. Walking the live 2025 form
 * field-by-field showed the cost: what the app called "Z51 / Z52 —
 * ausländische Quellensteuer" are, on the real form, the Steuernummer and
 * income of a foreign FAMILY FOUNDATION (§15 AStG, section 12). The creditable
 * foreign tax is Zeile 41. A user who trusted the export would have declared a
 * foundation they do not have.
 *
 * Every `caption` below is copied verbatim from the live form. If you change
 * one, you are changing what a user types into a tax return — verify against
 * the form, not against memory.
 */

export type ElsterFieldKey =
  | "KAP_Z7" | "KAP_Z17" | "KAP_Z19" | "KAP_Z20" | "KAP_Z22" | "KAP_Z23"
  | "KAP_Z37" | "KAP_Z38" | "KAP_Z41"
  | "KAP_INV_S1_Z4" | "KAP_INV_S1_Z5" | "KAP_INV_S1_Z6" | "KAP_INV_S1_Z7" | "KAP_INV_S1_Z8"
  | "KAP_INV_S2_Z14" | "KAP_INV_S2_Z17" | "KAP_INV_S2_Z20" | "KAP_INV_S2_Z23" | "KAP_INV_S2_Z26";

/** How a line relates to another line's total.
 *  - `contained_in`: the form says "zusätzlich" / "darin enthaltene" — this
 *    line's magnitude is ALSO part of the parent's total.
 *  - `excluded_from`: the form says "ausschließlich" — this line is declared
 *    ONLY here and must never reach the parent. */
export type Inclusion =
  | { kind: "standalone" }
  | { kind: "contained_in"; parent: ElsterFieldKey }
  | { kind: "excluded_from"; parent: ElsterFieldKey };

export type ElsterField = {
  key: ElsterFieldKey;
  form: "KAP" | "KAP_INV";
  /** ELSTER's own section number in the left-hand navigation. */
  section: number;
  zeile: string;
  /** Verbatim German caption as printed on the form. */
  caption: string;
  precision: "whole_euro" | "euro_cent";
  /** `signed` lines may legitimately be negative; `magnitude` lines never are. */
  sign: "signed" | "magnitude";
  inclusion: Inclusion;
  /** Where the number comes from. `declared` lines are transcribed from a
   *  Steuerbescheinigung (§45a EStG) and are NOT recomputable from
   *  transactions — the withheld tax appears in no export. */
  source: "derived" | "declared";
};

export const KAP_FIELDS: ElsterField[] = [
  {
    key: "KAP_Z7", form: "KAP", section: 3, zeile: "7",
    caption: "Kapitalerträge",
    precision: "whole_euro", sign: "magnitude",
    inclusion: { kind: "standalone" }, source: "declared",
  },
  {
    key: "KAP_Z17", form: "KAP", section: 4, zeile: "17",
    caption:
      "In Anspruch genommener Sparer-Pauschbetrag, der auf die in der Anlage KAP nicht erklärten Kapitalerträge entfällt",
    precision: "whole_euro", sign: "magnitude",
    inclusion: { kind: "standalone" }, source: "declared",
  },
  {
    key: "KAP_Z19", form: "KAP", section: 5, zeile: "19",
    caption: "Ausländische Kapitalerträge (ohne Beträge laut den Zeilen 26a und 52)",
    precision: "whole_euro", sign: "signed",
    inclusion: { kind: "standalone" }, source: "derived",
  },
  {
    key: "KAP_Z20", form: "KAP", section: 5, zeile: "20",
    caption:
      "In den Zeilen 18 und 19 enthaltene Gewinne aus Aktienveräußerungen i. S. d. § 20 Abs. 2 Satz 1 Nr. 1 EStG",
    precision: "whole_euro", sign: "magnitude",
    inclusion: { kind: "contained_in", parent: "KAP_Z19" }, source: "derived",
  },
  {
    key: "KAP_Z22", form: "KAP", section: 5, zeile: "22",
    caption:
      "In den Zeilen 18 und 19 enthaltene Verluste ohne Verluste aus der Veräußerung von Aktien",
    precision: "whole_euro", sign: "magnitude",
    inclusion: { kind: "contained_in", parent: "KAP_Z19" }, source: "derived",
  },
  {
    key: "KAP_Z23", form: "KAP", section: 5, zeile: "23",
    caption:
      "In den Zeilen 18 und 19 enthaltene Verluste aus der Veräußerung von Aktien i. S. d. § 20 Abs. 2 Satz 1 Nr. 1 EStG",
    precision: "whole_euro", sign: "magnitude",
    inclusion: { kind: "contained_in", parent: "KAP_Z19" }, source: "derived",
  },
  {
    key: "KAP_Z37", form: "KAP", section: 8, zeile: "37",
    caption: "Kapitalertragsteuer",
    precision: "euro_cent", sign: "magnitude",
    inclusion: { kind: "standalone" }, source: "declared",
  },
  {
    key: "KAP_Z38", form: "KAP", section: 8, zeile: "38",
    caption: "Solidaritätszuschlag",
    precision: "euro_cent", sign: "magnitude",
    inclusion: { kind: "standalone" }, source: "declared",
  },
  {
    key: "KAP_Z41", form: "KAP", section: 8, zeile: "41",
    caption: "Anrechenbare noch nicht angerechnete ausländische Steuern",
    precision: "euro_cent", sign: "magnitude",
    inclusion: { kind: "standalone" }, source: "derived",
  },
];

export const KAP_INV_FIELDS: ElsterField[] = [
  ...([
    ["KAP_INV_S1_Z4", "4", "Aktienfonds i. S. d. § 2 Abs. 6 InvStG (vor Teilfreistellung)"],
    ["KAP_INV_S1_Z5", "5", "Mischfonds i. S. d. § 2 Abs. 7 InvStG (vor Teilfreistellung)"],
    ["KAP_INV_S1_Z6", "6", "Immobilienfonds i. S. d. § 2 Abs. 9 Satz 1 InvStG (vor Teilfreistellung und ohne Beträge laut Zeile 7)"],
    ["KAP_INV_S1_Z7", "7", "Auslands-Immobilienfonds i. S. d. § 2 Abs. 9 Satz 2 InvStG (vor Teilfreistellung)"],
    ["KAP_INV_S1_Z8", "8", "sonstigen Investmentfonds"],
  ] as const).map(([key, zeile, caption]): ElsterField => ({
    key, form: "KAP_INV", section: 1, zeile, caption,
    precision: "whole_euro", sign: "magnitude",
    inclusion: { kind: "standalone" }, source: "derived",
  })),
  ...([
    ["KAP_INV_S2_Z14", "14", "Aktienfonds i. S. d. § 2 Abs. 6 InvStG (vor Teilfreistellung)"],
    ["KAP_INV_S2_Z17", "17", "Mischfonds i. S. d. § 2 Abs. 7 InvStG (vor Teilfreistellung)"],
    ["KAP_INV_S2_Z20", "20", "Immobilienfonds i. S. d. § 2 Abs. 9 Satz 1 InvStG (vor Teilfreistellung und ohne Beträge laut Zeile 23)"],
    ["KAP_INV_S2_Z23", "23", "Auslands-Immobilienfonds i. S. d. § 2 Abs. 9 Satz 2 InvStG (vor Teilfreistellung)"],
    ["KAP_INV_S2_Z26", "26", "Sonstige Investmentfonds"],
  ] as const).map(([key, zeile, caption]): ElsterField => ({
    key, form: "KAP_INV", section: 2, zeile, caption,
    // Section 2 is "Gewinne UND Verluste" — a net figure that may be negative.
    precision: "whole_euro", sign: "signed",
    inclusion: { kind: "standalone" }, source: "derived",
  })),
];

export const ALL_ELSTER_FIELDS: ElsterField[] = [...KAP_FIELDS, ...KAP_INV_FIELDS];

const BY_KEY = new Map<ElsterFieldKey, ElsterField>(
  ALL_ELSTER_FIELDS.map((f) => [f.key, f]),
);

export function fieldFor(key: ElsterFieldKey): ElsterField {
  const f = BY_KEY.get(key);
  if (!f) throw new Error(`Unknown ELSTER field: ${key}`);
  return f;
}

/** Keys whose magnitudes are part of `parentKey`'s total. */
export function containedChildren(parentKey: ElsterFieldKey): ElsterFieldKey[] {
  return ALL_ELSTER_FIELDS
    .filter((f) => f.inclusion.kind === "contained_in" && f.inclusion.parent === parentKey)
    .map((f) => f.key);
}

/** Human-readable label used by the PDF, the values card and the checklist.
 *  Single source — three copies of these strings previously drifted. */
export function labelFor(key: ElsterFieldKey): string {
  const f = fieldFor(key);
  return `Z${f.zeile} — ${f.caption}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/tax/elster-fields.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/elster-fields.ts tests/tax/elster-fields.test.ts
git commit -m "feat(tax): declarative ELSTER field registry with verbatim captions"
```

---

### Task 2: Zeile 19 becomes the net total

**Files:**
- Modify: `src/lib/tax/german-tax.ts` (the `z19` accumulator and the `lines.Z19` emission)
- Test: `tests/tax/kap-z19-net.test.ts`

**Interfaces:**
- Consumes: `fieldFor`, `containedChildren` from Task 1; existing
  `buildKapAndKapInv`, `buildInputs` from `tests/tax/kap-fixtures.ts`.
- Produces: no new exports. `draft.kap.lines.Z19` may now be negative.

**Why:** the form's Zeilen 22/23 read *"In den Zeilen 18 und 19 **enthaltene**
Verluste"*, and the official help for Zeilen 18/19 says disposals go in Zeile 19
and *"**zusätzlich**"* into 20/22/23. ELSTER confirmed it empirically: with a
gross 917 it derived a Zwischensumme of 3.584; with the net −1398 it derived
1.302.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tax/kap-z19-net.test.ts
/**
 * Zeile 19 is the NET foreign capital-income total: gains AND losses are
 * "darin enthalten". Emitting it gross is what made a real 2025 filing
 * over-declare EUR 3.611 of income.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { buildKapAndKapInv } from "@/lib/tax/german-tax";
import { containedChildren } from "@/lib/tax/elster-fields";
import { buildInputs, dividend, interest, match, ACCT } from "./kap-fixtures";

const STOCK = { kind: "stock" as const, subtype: null };

function draftFor() {
  return buildKapAndKapInv(
    buildInputs(
      [
        dividend({ brokerAccountId: ACCT.ff, symbol: "GM", amountEur: "297.73" }),
        interest({ brokerAccountId: ACCT.ibkr, amountEur: "33.30" }),
      ],
      [
        match({ brokerAccountId: ACCT.ff, symbol: "META", gainEur: "585.53" }),
        match({ brokerAccountId: ACCT.ff, symbol: "ENPH", gainEur: "-2228.45" }),
        match({ brokerAccountId: ACCT.ibkr, symbol: "BOND", gainEur: "-86.52" }),
      ],
      { GM: STOCK, META: STOCK, ENPH: STOCK, BOND: { kind: "bond", subtype: null } },
    ),
  );
}

describe("Anlage KAP Zeile 19 — net, not gross", () => {
  it("subtracts the contained losses from the Zeile 19 total", () => {
    // 297.73 + 33.30 + 585.53 - 2228.45 - 86.52
    expect(draftFor().kap.lines.Z19.cents).toBe("-1398.41");
    expect(draftFor().kap.lines.Z19.euros).toBe(-1398);
  });

  it("still reports the breakouts as positive magnitudes", () => {
    const d = draftFor();
    expect(d.kap.lines.Z20.cents).toBe("585.53");
    expect(d.kap.lines.Z23.cents).toBe("2228.45");
    expect(d.kap.lines.Z22.cents).toBe("86.52");
  });

  it("holds the containment invariant: parent + contained magnitudes reconcile", () => {
    const d = draftFor();
    const children = containedChildren("KAP_Z19");
    expect(children).toHaveLength(3);
    // Z19 + Z22 + Z23 - Z20 == the non-disposal income (dividends + interest)
    const rebuilt = new Decimal(d.kap.lines.Z19.cents)
      .plus(d.kap.lines.Z22.cents)
      .plus(d.kap.lines.Z23.cents)
      .minus(d.kap.lines.Z20.cents);
    expect(rebuilt.toFixed(2)).toBe("331.03");
  });

  it("keeps Zeile 19 positive when there are no losses", () => {
    const d = buildKapAndKapInv(
      buildInputs([dividend({ brokerAccountId: ACCT.ff, symbol: "GM", amountEur: "100.00" })], [], {
        GM: STOCK,
      }),
    );
    expect(d.kap.lines.Z19.cents).toBe("100.00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tax/kap-z19-net.test.ts`
Expected: FAIL — first assertion gets `"916.56"`, not `"-1398.41"`

- [ ] **Step 3: Net the losses into z19**

In `src/lib/tax/german-tax.ts`, immediately after the `for (const m of matches)`
loop closes (currently around line 525, just before the KAP-INV section-1/2
output is assembled), insert:

```ts
  // Zeile 19 is the NET foreign total. The form's Zeilen 20/22/23 are
  // "darin enthaltene" — contained in it — and the official help for
  // Zeilen 18/19 says disposals go here and "zusätzlich" into the breakouts.
  // Emitting it gross double-counts the losses: ELSTER re-adds the loss
  // lines when it derives "Kapitalerträge", which is exactly how a real
  // filing turned EUR 331 of income into EUR 3.584.
  z19 = z19.minus(stockLosses).minus(otherLosses);
```

Then change the emission (currently line 651) from a clamped to a signed value:

```ts
        Z19: toZeile(z19),                 // Ausländische Kapitalerträge — NET (may be negative)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/tax/kap-z19-net.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Update the affected goldens**

Run: `pnpm vitest run tests/tax/`
Expected: failures in `kap-gain-loss-split.test.ts`, `kap-scenarios.test.ts`,
`kap-inv-golden.test.ts`, `gf-fixture-snapshot.test.ts`, `accruals-filter.test.ts`.

For each failing assertion on `Z19`, recompute the expected value as
`previous_Z19 − Z22 − Z23` and update it. **Do not** change any `Z20` / `Z22` /
`Z23` expectation — those were already correct. Add this comment above each
changed expectation:

```ts
// Z19 is the NET total (Zeilen 20/22/23 are "darin enthaltene"), corrected 2026-07-19.
```

The GF fixture in `gf-fixture-snapshot.test.ts` must still produce her filed
values: all-zero KAP and KAP-INV Z4 = 127. If it does not, stop — that means
the change is wrong, not the golden.

- [ ] **Step 6: Verify the whole suite**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tax/german-tax.ts tests/tax/
git commit -m "fix(tax): Zeile 19 is the NET foreign total, not gross

The form's Zeilen 20/22/23 are 'darin enthaltene' and the help text for
Zeilen 18/19 says disposals go in 19 and 'zusaetzlich' into the breakouts.
Emitting 19 gross double-counts losses: ELSTER re-adds the loss lines when
deriving Kapitalertraege. On a real 2025 filing this turned EUR 331 of
income into EUR 3.584 and cost EUR 489 of tax."
```

---

### Task 3: Zeile 41 replaces the phantom Zeilen 51 / 52

**Files:**
- Modify: `src/lib/tax/german-tax.ts` (`FormTarget`, `GermanTaxDraft.kap`, emission, the legacy shim)
- Modify: `src/lib/api/contracts.ts:191-203` (zod line schema)
- Test: `tests/tax/kap-wht.test.ts` (rename assertions)

**Interfaces:**
- Consumes: Task 1's registry.
- Produces: `draft.kap.lines.Z41` now carries the treaty-capped creditable
  foreign tax (previously `Z52`). `draft.kap.foreignWhtGross: ZeileValue` is a
  new **non-line** informational field (previously `Z51`). `lines.Z51` and
  `lines.Z52` no longer exist. `FormTarget` gains `"KAP_Z41"` and loses
  `"KAP_Z51"` / `"KAP_Z52"`.

- [ ] **Step 1: Write the failing test**

Add to `tests/tax/kap-wht.test.ts`:

```ts
describe("foreign withholding lands on the real form line", () => {
  it("puts creditable foreign tax in Zeile 41, section 8", () => {
    const d = buildKapAndKapInv(
      buildInputs(
        [dividend({ brokerAccountId: ACCT.ibkr, symbol: "TSM", amountEur: "100.00", whtEur: "15.00" })],
        [],
        { TSM: { kind: "stock", subtype: null } },
      ),
    );
    expect(d.kap.lines.Z41.cents).toBe("15.00");
  });

  it("keeps the gross figure OFF the form — there is no Zeile for it", () => {
    const d = buildKapAndKapInv(
      buildInputs(
        [dividend({ brokerAccountId: ACCT.ibkr, symbol: "TSM", amountEur: "100.00", whtEur: "30.00" })],
        [],
        { TSM: { kind: "stock", subtype: null } },
      ),
    );
    // 30 % withheld, treaty caps credit at 15 % of the gross.
    expect(d.kap.foreignWhtGross.cents).toBe("30.00");
    expect(d.kap.lines.Z41.cents).toBe("15.00");
    expect((d.kap.lines as Record<string, unknown>).Z51).toBeUndefined();
    expect((d.kap.lines as Record<string, unknown>).Z52).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tax/kap-wht.test.ts`
Expected: FAIL — `d.kap.foreignWhtGross` is undefined; `Z41` is `0.00`.

- [ ] **Step 3: Rewrite the type and emission**

In `src/lib/tax/german-tax.ts`:

Replace the `FormTarget` union (line 84-88) with:

```ts
// Line numbers verified against the live ELSTER 2025 form on 2026-07-19.
// Zeilen 51/52 are NOT withholding lines — they are the Steuernummer and
// income of a foreign Familienstiftung (§15 AStG, section 12). Creditable
// foreign tax is Zeile 41. See docs/elster-anlage-kap-2025-gaps.md.
export type FormTarget =
  | "KAP_Z7" | "KAP_Z37" | "KAP_Z38" | "KAP_Z41"
  | "KAP_Z19" | "KAP_Z20" | "KAP_Z22" | "KAP_Z23"
  | "KAP_INV_S1_Z4" | "KAP_INV_S1_Z5" | "KAP_INV_S1_Z6" | "KAP_INV_S1_Z7" | "KAP_INV_S1_Z8"
  | "KAP_INV_S2_Z14" | "KAP_INV_S2_Z17" | "KAP_INV_S2_Z20" | "KAP_INV_S2_Z23" | "KAP_INV_S2_Z26";
```

In `GermanTaxDraft.kap`, add the informational field next to
`stockLossCarryforward` and replace the two line entries:

```ts
    stockLossCarryforward: ZeileValue;
    /** Gross foreign withholding actually suffered. Informational — the 2025
     *  form has NO field for it; only the creditable (treaty-capped) amount
     *  in Zeile 41 is entered. Kept for the reconciliation view and evidence. */
    foreignWhtGross: ZeileValue;
    lines: {
      Z7: ZeileValue;
      Z17: ZeileValue;
      Z19: ZeileValue;
      Z20: ZeileValue;
      Z22: ZeileValue;
      Z23: ZeileValue;
      Z37: ZeileValue;
      Z38: ZeileValue;
      /** Anrechenbare noch nicht angerechnete ausländische Steuern
       *  (section 8). Treaty-capped: tax withheld above the treaty rate is
       *  reclaimable from the source state, not creditable in Germany. */
      Z41: ZeileValue;
    };
```

Update the return block (lines 648-660) to:

```ts
      foreignWhtGross: toZeile(z51, true),
      lines: {
        Z7: toZeile(domestic.kapitalertraege, true),
        Z17: ZERO(),
        Z19: toZeile(z19),
        Z20: toZeile(stockGains, true),
        Z22: toZeile(otherLosses, true),
        Z23: toZeile(stockLosses, true),
        Z37: toZeile(domestic.kest, true),
        Z38: toZeile(domestic.solz, true),
        Z41: toZeile(z52, true),
      },
```

Replace every `formTarget: "KAP_Z51"` / `"KAP_Z52"` occurrence with
`"KAP_Z41"`, and update the three warning strings that name "KAP Z51/Z52" to
name "KAP Zeile 41" instead.

Fix the legacy shim (lines 704-705) to read from the new locations:

```ts
      Z51: d.kap.foreignWhtGross.cents,
      Z52: d.kap.lines.Z41.cents,
```

- [ ] **Step 4: Update the wire contract**

In `src/lib/api/contracts.ts`, replace `Z51`/`Z52` in the `lines` object (lines
199-202) with `Z41: zeileValueSchema`, add `foreignWhtGross: zeileValueSchema`
next to `stockLossCarryforward` (line 190), and update `formTargetSchema`
(line 164-168) to match the new `FormTarget` union.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm typecheck && pnpm vitest run tests/tax/`
Expected: PASS. `pnpm typecheck` will flag the PDF, values card and checklist —
those are Task 4; if they block, stub them by swapping `Z51`/`Z52` for `Z41`
and finish properly in Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tax/german-tax.ts src/lib/api/contracts.ts tests/tax/kap-wht.test.ts
git commit -m "fix(tax): creditable foreign tax is Zeile 41, not 51/52

Zeilen 51/52 on the real Anlage KAP are the Steuernummer and income of a
foreign Familienstiftung (para 15 AStG). Printing our withholding figures
under those labels would have had users declare a foundation they do not
have. Gross withholding has no field at all and becomes informational."
```

---

### Task 4: Consumers read captions and precision from the registry

**Files:**
- Modify: `src/lib/tax/export-pdf.tsx:30-42` (delete `KAP_LABELS`)
- Modify: `src/components/pulse/elster-values-card.tsx:4-16` (delete `KAP_LABELS`)
- Modify: `src/components/pulse/pre-submit-checklist.tsx`
- Test: `tests/tax/elster-labels.test.ts`

**Interfaces:**
- Consumes: `labelFor`, `fieldFor`, `KAP_FIELDS` from Task 1; the Task 3 draft shape.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tax/elster-labels.test.ts
/**
 * The captions shown in the PDF and the values card must come from the
 * registry, not from local copies. Three copies previously existed and could
 * drift; one of them shipped a caption pointing at the wrong form section.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { labelFor, fieldFor } from "@/lib/tax/elster-fields";

const FILES = [
  "src/lib/tax/export-pdf.tsx",
  "src/components/pulse/elster-values-card.tsx",
];

describe("caption single-sourcing", () => {
  it("no consumer defines its own KAP_LABELS map", () => {
    for (const f of FILES) {
      expect(readFileSync(f, "utf8")).not.toContain("const KAP_LABELS");
    }
  });

  it("labelFor renders Zeile number and caption together", () => {
    expect(labelFor("KAP_Z41")).toBe(
      "Z41 — Anrechenbare noch nicht angerechnete ausländische Steuern",
    );
  });

  it("exposes precision so the export can stop saying 'whole euros' everywhere", () => {
    expect(fieldFor("KAP_Z19").precision).toBe("whole_euro");
    expect(fieldFor("KAP_Z37").precision).toBe("euro_cent");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tax/elster-labels.test.ts`
Expected: FAIL on the first assertion — both files still declare `KAP_LABELS`.

- [ ] **Step 3: Rewrite the two renderers**

In both `export-pdf.tsx` and `elster-values-card.tsx`, delete the local
`KAP_LABELS` const and import from the registry instead:

```tsx
import { KAP_FIELDS, labelFor, fieldFor } from "@/lib/tax/elster-fields";
import type { ElsterFieldKey } from "@/lib/tax/elster-fields";
```

Replace the KAP rendering loop in both files with a registry-driven one. In
`elster-values-card.tsx`:

```tsx
        {KAP_FIELDS.map((f) => {
          const key = f.key.replace("KAP_", "") as keyof typeof draft.kap.lines;
          return (
            <ZeileRow
              key={f.key}
              label={labelFor(f.key)}
              value={draft.kap.lines[key]}
              precision={f.precision}
            />
          );
        })}
```

Extend `ZeileRow` in both files to honour precision — a `euro_cent` line must
show the cents value as the primary figure, because that is what ELSTER
accepts there:

```tsx
function ZeileRow({
  label, value, precision,
}: { label: string; value: ZeileValue; precision: "whole_euro" | "euro_cent" }) {
  const isZero = value.cents === "0.00";
  const primary = precision === "euro_cent" ? value.cents : String(value.euros);
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-border/40 last:border-0">
      <span className={`text-[12px] ${isZero ? "text-dim" : "text-ink"}`}>{label}</span>
      <span className="flex items-baseline gap-2">
        <span className={`font-mono text-base ${isZero ? "text-dim" : "text-ink font-semibold"}`}>
          {primary}
        </span>
        {!isZero && precision === "whole_euro" && (
          <span className="font-mono text-[10px] text-muted">actual €{value.cents}</span>
        )}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Fix the export's blanket rounding instruction**

In `export-pdf.tsx`, the page subtitle currently tells the user to enter whole
euros for everything. Replace that paragraph with:

```tsx
      <Text style={styles.subtle}>
        Income lines (Zeilen 7, 17, 19–23) take WHOLE EUROS — enter the large
        number with no decimal separator. The tax-credit lines in section 8
        (Zeilen 37, 38, 41) take EUROS AND CENTS — enter them exactly as shown,
        including the decimals. Entering 20 instead of 20,30 discards
        creditable tax.
      </Text>
```

Update the `pre-submit-checklist.tsx` item that names Zeile 51 to name Zeile 41,
and drop the gross figure from the checklist entirely — it is not a form line.

- [ ] **Step 5: Run tests, typecheck and build**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all green, no remaining references to `KAP_Z51` / `KAP_Z52` outside
the legacy shim.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tax/export-pdf.tsx src/components/pulse/ tests/tax/elster-labels.test.ts
git commit -m "refactor(tax): single-source ELSTER captions, per-line precision

Deletes two drifting copies of KAP_LABELS. Section 8 takes euros and cents,
not whole euros -- the previous blanket instruction would have had users
enter 20 instead of 20,30 and lose creditable tax."
```

---

### Task 5: The Freedom swap caveat fires only when swaps exist

**Files:**
- Modify: `src/lib/tax/kap-inputs.ts:379-386`
- Test: `tests/tax/kap-reconciliation.test.ts`

**Interfaces:**
- Consumes: existing `buildReconciliation(draft, accountRows)`.
- Produces: unchanged signature; the caveat becomes conditional.

**Why:** the caveat currently fires for every Freedom user on
`brokers.has("FREEDOM_FINANCE")` alone. On the live database it fired for a
user with zero swap rows in any year and sent the filing off on a false trail.
A warning that always fires carries no information.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/tax/kap-reconciliation.test.ts
describe("swap caveat is conditional", () => {
  it("stays silent for a Freedom user with no derivative rows", () => {
    const d = buildKapAndKapInv(
      buildInputs([dividend({ brokerAccountId: ACCT.ff, symbol: "GM", amountEur: "10.00" })], [], {
        GM: { kind: "stock", subtype: null },
      }),
    );
    const r = buildReconciliation(d, accounts());
    expect(r.caveats.join(" ")).not.toMatch(/equity swap/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tax/kap-reconciliation.test.ts`
Expected: FAIL — the caveat is present.

- [ ] **Step 3: Make it conditional**

Change the signature to accept the evidence-bearing draft it already has, and
gate on detected rows rather than on the broker existing:

```ts
  // Only warn when the ledger actually contains swap-shaped rows. Warning
  // every Freedom user regardless trained the filer to ignore warnings and
  // cost a real filing session chasing a phantom figure (2026-07-19).
  const hasSwapRows = draft.evidence.some(
    (e) => e.symbol != null && /(^|\W)(FRHC|SWAP)(\W|$)/i.test(e.symbol),
  );
  if (hasSwapRows) {
    caveats.push(
      "Freedom equity swaps (Termingeschäfte, §20 Abs.2 Nr.3) are not yet distinguished by the importer — verify them manually with your Steuerberater.",
    );
  }
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/tax/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/kap-inputs.ts tests/tax/kap-reconciliation.test.ts
git commit -m "fix(tax): swap caveat fires on detected rows, not on broker presence"
```

---

### Task 6: Persona golden — reproduce ELSTER's own arithmetic

**Files:**
- Create: `tests/tax/personas/foreign-only-single.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: the regression that locks the whole chain.

**Why:** this is the only test backed by an authority outside our own code —
ELSTER computed these figures on 2026-07-19 from the values a real user typed.

- [ ] **Step 1: Write the test**

```ts
// tests/tax/personas/foreign-only-single.test.ts
/**
 * PERSONA: unmarried, no church tax, foreign brokers only, above 25 % marginal
 * rate. Plain shares plus equity ETFs, one bond sold at a loss, one German
 * savings certificate.
 *
 * The expectations below are NOT our arithmetic — they are what ELSTER itself
 * computed on 2026-07-19 from these exact inputs:
 *
 *   Kapitalerträge                        364
 *   Gewinne aus Veräußerung von Aktien    586
 *   Investmenterträge                     352
 *   Zwischensumme                       1.302
 *   Einkünfte i.S.d. § 32d Abs. 1 EStG        0
 *   nicht ausgleichsfähige Verluste     1.642
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { buildKapAndKapInv } from "@/lib/tax/german-tax";
import { buildInputs, dividend, interest, match, ACCT } from "../kap-fixtures";

const STOCK = { kind: "stock" as const, subtype: null };
const AKTIENFONDS = { kind: "etf" as const, subtype: "aktien" as const };

function persona() {
  return buildKapAndKapInv({
    ...buildInputs(
      [
        dividend({ brokerAccountId: ACCT.ff, symbol: "GM", amountEur: "297.73" }),
        interest({ brokerAccountId: ACCT.ibkr, amountEur: "33.30" }),
        dividend({ brokerAccountId: ACCT.ff, symbol: "SPY", amountEur: "440.76" }),
      ],
      [
        match({ brokerAccountId: ACCT.ff, symbol: "META", gainEur: "585.53" }),
        match({ brokerAccountId: ACCT.ff, symbol: "ENPH", gainEur: "-2228.45" }),
        match({ brokerAccountId: ACCT.ibkr, symbol: "BOND", gainEur: "-86.52" }),
        match({ brokerAccountId: ACCT.ff, symbol: "SCHD", gainEur: "55.10" }),
      ],
      {
        GM: STOCK, META: STOCK, ENPH: STOCK,
        BOND: { kind: "bond", subtype: null },
        SPY: AKTIENFONDS, SCHD: AKTIENFONDS,
      },
    ),
    domesticCertificates: [
      {
        issuer: "Revolut Bank UAB, Zweigniederlassung Deutschland",
        kapitalertraegeEur: "33.40",
        allowanceUsedEur: "0.00",
        kestEur: "8.35",
        solzEur: "0.46",
      },
    ],
  });
}

describe("persona: foreign-only-single (ELSTER-verified)", () => {
  it("emits the corrected form values", () => {
    const l = persona().kap.lines;
    expect(l.Z7.euros).toBe(33);
    expect(l.Z19.euros).toBe(-1398);
    expect(l.Z20.euros).toBe(586);
    expect(l.Z22.euros).toBe(87);
    expect(l.Z23.euros).toBe(2228);
    expect(l.Z37.cents).toBe("8.35");
    expect(l.Z38.cents).toBe("0.46");
  });

  it("reproduces ELSTER's 'Kapitalerträge' of 364", () => {
    // ELSTER derives it as Z7 + (Z19 - Z20 + Z22 + Z23).
    const l = persona().kap.lines;
    const derived = new Decimal(l.Z19.euros)
      .minus(l.Z20.euros).plus(l.Z22.euros).plus(l.Z23.euros)
      .plus(l.Z7.euros);
    expect(derived.toNumber()).toBe(364);
  });

  it("reproduces ELSTER's Zwischensumme of 1.302", () => {
    const d = persona();
    const l = d.kap.lines;
    const kapitalertraege = new Decimal(l.Z19.euros)
      .minus(l.Z20.euros).plus(l.Z22.euros).plus(l.Z23.euros)
      .plus(l.Z7.euros);
    // Investmenterträge after 30 % Teilfreistellung, truncated per line as
    // ELSTER does: 441 -> 308, 55 -> 38, plus the Vorabpauschale 9 -> 6.
    const inv = Math.trunc(d.kapInv.section1.Z4_aktienfonds.euros * 0.7)
      + Math.trunc(d.kapInv.section2.Z14_aktienfonds.euros * 0.7)
      + Math.trunc(9 * 0.7);
    expect(kapitalertraege.plus(l.Z20.euros).plus(inv).toNumber()).toBe(1302);
  });

  it("carries forward exactly the losses ELSTER could not offset", () => {
    expect(persona().kap.stockLossCarryforward.euros).toBe(1642);
  });

  it("emits no negative magnitude lines", () => {
    const l = persona().kap.lines;
    for (const [k, v] of Object.entries(l)) {
      if (k === "Z19") continue; // the only signed line
      expect(Number(v.cents)).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/tax/personas/foreign-only-single.test.ts`
Expected: PASS. If the Zwischensumme assertion fails, check the truncation
direction before changing the expectation — ELSTER rounds toward the taxpayer.

- [ ] **Step 3: Full verification**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add tests/tax/personas/
git commit -m "test(tax): ELSTER-verified persona golden for the foreign-only filer

Expectations are ELSTER's own 2026-07-19 computation, not ours: Kapitalertraege
364, Zwischensumme 1.302, section 32d income 0, carryforward 1.642."
```

---

## Self-review

**Spec coverage.** This plan implements spec §4.1 (form as model), §4.3
(honest coverage, partially — Task 5), and the P0 items 1, 2 (routing half) and
8/8b from the gaps log. It does **not** implement Termingeschäfte lines 21/24
or Zeile 25 — those need instrument detection and belong to Plan 4; the
registry deliberately omits them rather than shipping fields nothing populates.
Certificates (Plan 2), profile (Plan 3), Vorabpauschale (Plan 5) and the
correction workflow (Plan 6) are out of scope here.

**Placeholders.** None — every step carries the actual code or the exact
command.

**Type consistency.** `ElsterFieldKey` in Task 1 matches the `FormTarget` union
in Task 3 minus the KAP-INV-only members; `labelFor` / `fieldFor` /
`containedChildren` are used in Tasks 2 and 4 exactly as defined in Task 1;
`foreignWhtGross` is introduced in Task 3 and consumed in Task 4's checklist
edit.

**Known risk.** Task 2 step 5 rewrites golden expectations. That is the one
place a mistake would silently bless wrong numbers. The guard is the GF fixture
— if it stops reproducing her successfully filed values, the change is wrong,
not the golden.
