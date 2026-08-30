# Public Landing Page — Tax-Correctness Review

Status: **1 MUST CHANGE (blocking), 1 MUST CHANGE (scope), 1 NEEDS DISCLAIMER.**
Date: 2026-08-29. Reviewer: `tax-advisor` (skills: `tax-system`, `ibkr-tax`).

Subject: `src/app/(marketing)/page.tsx` on `feat/public-landing-page`, reviewed
before push per [design](2026-08-29-public-landing-page-design.md) §8/Q4
prohibition 6, which flagged `"365-day cliff"` and `"€256 Freigrenze"` as
sitting at the edge of the permitted latitude.

Authority order applied per the `tax-system` skill: project docs → BMF /
official ELSTER → tax guide PDF (plain-language only). Every figure below was
verified against primary text retrieved during this review. `2026+TaxGuide.pdf`
was **not** consulted: `pdftotext` is still absent on this host (the skill's
known caveat), and nothing here needed it — all three claims resolved against
statute and BMF directly.

## Summary

| # | Claim | Verdict | Core defect |
|---|---|---|---|
| 1 | "Per-event ECB FX, FIFO cost basis, evidence CSV. The Z-line numbers you type into ELSTER, computed for you." | **MUST CHANGE** | Card is titled "Anlage KAP + **Anlage SO**", but the app emits Zeile numbers for KAP/KAP-INV only. "FIFO cost basis" over-simplifies the crypto rule. |
| 2 | "Tracks the 365-day cliff for long-term tax-free gains and the €256 Freigrenze, so you know whether you owe anything." | **MUST CHANGE (blocking)** | €256 is the **§22 Nr. 3** Freigrenze, attached here to the **§23** holding-period clause. §23's figure is €1 000. Plus "365-day" ≠ the statutory Jahresfrist, and "you know whether you owe anything" is not something this app can know. |
| 3 | Hero: "export a ready-to-type **Anlage KAP / SO** draft each January." | **NEEDS DISCLAIMER** | Accurate as product description, but it is the only tax-figure surface in the product carrying **no** "not a certified filing / verify with your Steuerberater" caveat. |

### Sources relied on

- **§ 22 Nr. 3 Satz 2 EStG**, verbatim from gesetze-im-internet.de (BMJ
  official consolidated text, retrieved 2026-08-29):
  > "Solche Einkünfte sind nicht einkommensteuerpflichtig, wenn sie weniger
  > als 256 Euro im Kalenderjahr betragen haben."
- **§ 23 Abs. 1 Satz 1 Nr. 2 Satz 1 EStG**, same source:
  > "Veräußerungsgeschäfte bei anderen Wirtschaftsgütern, bei denen der
  > Zeitraum zwischen Anschaffung und Veräußerung nicht mehr als ein Jahr
  > beträgt."
- **§ 23 Abs. 3 Satz 5 EStG**, same source:
  > "Gewinne bleiben steuerfrei, wenn der aus den privaten
  > Veräußerungsgeschäften erzielte Gesamtgewinn im Kalenderjahr weniger als
  > 1 000 Euro betragen hat."
- **§ 23 Abs. 3 Satz 7 EStG**, same source: §23 losses offset only §23 gains
  of the same calendar year and may not be deducted under § 10d.
- **BMF-Schreiben v. 6. März 2025**, "Einzelfragen zur ertragsteuerrechtlichen
  Behandlung bestimmter Kryptowerte", GZ **IV C 1 - S 2256/00042/064/043**,
  DOK COO.7005.100.4.11527963, 34 pages. Retrieved as PDF from
  bundesfinanzministerium.de and text-extracted locally. Operative
  Randnummern:
  - **Rn. 45** — block-creation income not attributable to another income type
    is taxable as a Leistung under § 22 Nr. 3 EStG, and:
    > "Sie sind nicht einkommensteuerpflichtig, wenn sie **zusammen mit anderen
    > Einkünften aus Leistungen** weniger als 256 € im Kalenderjahr betragen
    > haben (§ 22 Nummer 3 Satz 2 EStG)."
  - **Rn. 48** — passive staking (staking pool, platform staking):
    > "Einnahmen aus (passivem) Staking … unterliegen in der Regel als der
    > privaten Vermögensverwaltung unterfallende Fruchtziehung der Besteuerung
    > nach § 22 Nummer 3 EStG."
  - **Rn. 55** — "Die Veräußerungsfristen des § 23 Absatz 1 Satz 1 Nummer 2
    EStG beginnen nach jedem Tausch neu"; the **Jahresfrist** is determined
    from platform-recorded or wallet timestamps.
  - **Rn. 61** — Verwendungsreihenfolge: "gilt der Grundsatz der
    **Einzelbetrachtung**". Only if individual identification is impossible do
    the first-acquired units count as sold, with the **Durchschnittsmethode**
    for valuation; FIFO for valuation is expressly a simplification
    ("Aus Vereinfachungsgründen kann … unterstellt werden"), it is
    **wallet-scoped** ("Es gilt eine walletbezogene Betrachtung"), and the
    chosen method must be kept until that wallet's holding of that
    Handelsbezeichnung is fully sold (Wahlrecht on re-entry).
  - **Rn. 63** — "Bei Currency oder Payment Token … kommt die Verlängerung der
    Veräußerungsfrist nach § 23 Absatz 1 Satz 1 Nummer 2 Satz 4 EStG nicht zur
    Anwendung." (The ten-year extension does **not** bite for staked/lent
    currency tokens — the app's one-year assumption is safe on this point.)

Not verified and therefore not relied on: the effective date of the §23
600 → 1 000 uplift encoded at `src/lib/tax/anlage-so.ts:33-35`. § 52 EStG
carries no transitional rule for § 23 Abs. 3 Satz 5, and I did not retrieve the
amending act. This is outside landing-page scope (the page names no §23 figure)
but is flagged in §4 below.

---

## 1. Feature card "Anlage KAP + Anlage SO"

> "Per-event ECB FX, FIFO cost basis, evidence CSV. The Z-line numbers you type
> into ELSTER, computed for you."

**Verdict: MUST CHANGE** (scope of the Z-line claim; precision of "FIFO").

### (a) As German tax law

Nothing here states a rate, threshold or line number, so prohibition 6 is not
engaged by the figures. Two characterisations are nonetheless loose:

- **"FIFO cost basis"** is correct for securities (BMF applies FIFO lot
  matching for § 20 disposals, and the `ibkr-tax` skill records the same). It
  is **not** an accurate statement of the crypto rule that this same card's
  sibling covers: BMF 06.03.2025 Rn. 61 makes **Einzelbetrachtung** the
  principle, FIFO a wallet-scoped simplification with a binding
  method-consistency constraint. A card that names Anlage SO in its title and
  "FIFO cost basis" in its body asserts more than the circular allows.
- **"Per-event ECB FX"** is sound and matches the `ibkr-tax` skill's rule (ECB
  reference rates, applied consistently).

### (b) As a description of this app

- **ECB FX — true.** `src/lib/ledger/fx.ts` converts per event and stamps
  `fxSource: "ECB"`, with a 7-day look-back to the nearest preceding
  publication for weekend/holiday events (documented as the Finanzamt
  convention). EUR-native events are stamped `"BROKER"` and skip conversion,
  which is correct, not a gap.
- **Evidence CSV — true.** `src/lib/tax/export-csv.ts` (KAP routing decisions)
  and `src/lib/tax/export-csv-so.ts` (per-payout staking evidence).
- **"The Z-line numbers you type into ELSTER" — overstated.**
  `src/lib/tax/elster-fields.ts` defines `ElsterFieldKey` as **KAP_* and
  KAP_INV_* only** — nine KAP lines and ten KAP-INV lines, captions copied
  verbatim from the live form. There are **no SO field keys**. Consistently,
  `src/lib/tax/export-pdf-so.tsx` never prints a Zeile number; it directs the
  user by box name ("ELSTER → Anlage SO → 'Leistungen' (§22 Nr. 3)",
  line 79-80). So the card names KAP **+ SO** and then promises Z-lines for
  both, when the app delivers them for KAP/KAP-INV only.

  This matters more than it looks: `elster-fields.ts`'s own header records that
  informally-derived Zeile numbers previously mislabelled the KAP foreign-tax
  line, and that "if you change one, you are changing what a user types into a
  tax return". Advertising Z-lines for a form the app does not emit them for
  invites exactly that error.

### (c) Tax-advice reading

"The Z-line numbers you type into ELSTER, computed for you" is the most
directive sentence on the page — it tells an anonymous reader what to enter on
a statutory form. See §3 for the disclaimer this needs.

### Proposed wording

> "Per-event ECB FX, FIFO lot matching, evidence CSV. Anlage KAP / KAP-INV
> Zeile values computed for you, with the Anlage SO figures alongside."

If a shorter line is wanted, dropping the form names entirely also resolves it:

> "Per-event ECB FX, FIFO lot matching, evidence CSV — the figures computed for
> you, ready to check and type in."

---

## 2. Feature card "§22 staking + §23 FIFO"

> "Tracks the 365-day cliff for long-term tax-free gains and the €256
> Freigrenze, so you know whether you owe anything."

**Verdict: MUST CHANGE — blocking.** Three independent defects; the first is
a plain misstatement of a statutory threshold on an indexable page.

### (a) As German tax law

**The card title is fine.** Pairing "§22 staking" with "§23" is an accurate
characterisation, now confirmed at the source: BMF 06.03.2025 **Rn. 48** puts
passive staking rewards under § 22 Nr. 3 EStG, and their later disposal falls
under § 23. Naming the paragraphs is expressly permitted by design §8/Q4.

**Defect 1 — €256 is the wrong Freigrenze for the clause it sits in.**
The sentence reads as one continuous §23 thought: holding-period cliff → tax-free
long-term gains → "and the €256 Freigrenze". But:

- €256 is the **§ 22 Nr. 3 Satz 2** Freigrenze — staking income.
- The **§ 23** Freigrenze is **€1 000** (§ 23 Abs. 3 Satz 5).

These are two legally separate buckets with separate thresholds, and a §23 loss
may not reduce §22 income (§ 23 Abs. 3 Satz 7). A German reader who takes the
sentence at face value concludes that crypto **sale gains** are free below €256
— understating their own allowance by €744 and, on the other side, believing
they owe tax at €300 of gains when they do not. This is the single most
consequential error on the page.

**"Freigrenze" itself is the correct term**, in both places. Both statutes read
"weniger als" — below the figure nothing is taxable, at or above it the *entire*
amount is, which is a Freigrenze (cliff), not a Freibetrag (allowance). The
page's "cliff" framing is right; only the number is misfiled.

**Defect 2 — "365-day cliff" is not the statutory test.**
§ 23 Abs. 1 Satz 1 Nr. 2 says "**nicht mehr als ein Jahr**", and BMF Rn. 55
calls it the **Jahresfrist**. A year is not 365 days: the period runs by
§ 108 AO with §§ 187, 188 BGB, so a leap day inside the holding period makes the
true boundary 366 days. On a page held to legal-correctness, quoting a day count
for a rule the statute states in years is a needless hostage.

**Defect 3 — "so you know whether you owe anything" is not true, and BMF says
why.** Rn. 45 ties the €256 Freigrenze to § 22 Nr. 3 income counted
**"zusammen mit anderen Einkünften aus Leistungen"** — i.e. aggregated with all
of the taxpayer's other Leistungen income for the year (occasional
intermediation, letting movable property, casual sales). The app sees only
Coinbase staking. A user with €200 of staking and €100 of other Leistungen is
over the cliff and owes on the full sum; this page tells them they are clear.

### (b) As a description of this app

**The app gets the law right — the landing page is the only place it is stated
wrongly.** `src/lib/tax/anlage-so.ts` is explicit and correct:

- `FREIGRENZE_22_EUR = 256` (line 28) for §22 Nr. 3;
- `freigrenze23For(taxYear)` returns 1000/600 for §23 (lines 33-35);
- the module header (lines 6-25) states the two buckets are legally separate,
  carry different Freigrenzen, and that a §23 loss may not reduce §22 income,
  citing § 23 Abs. 3 S. 7-8;
- `computeAnlageSoTotals` implements both cliffs independently and never sums
  them into one threshold.

The in-app page contradicts the landing page directly. `src/app/(app)/tax/[year]/anlage-so/page.tsx:150-152`:

> "Note: the two Freigrenzen are independent. §22 (€256) covers all your
> sonstige Leistungen (staking + e.g. occasional Kleinanzeigen sales); §23
> (€{s23.freigrenzeEur}) covers all private-sale gains. A §23 loss does not
> lower §22 income."

That copy is correct, and it even carries the "all your sonstige Leistungen"
qualifier that BMF Rn. 45 requires. The landing page compresses this into a
single sentence and loses both the second threshold and the qualifier. So this
is not only a tax error — it is the public page misdescribing the product's own
correct behaviour.

**Two code observations surfaced while cross-checking (out of scope for the
copy fix, reported for routing):**

1. The two replay engines disagree on the holding-period boundary:
   `src/lib/ledger/crypto-replay.ts:67` uses `isLongTerm: days > 365` while
   `src/lib/ledger/replay.ts:249` uses `isLongTerm: days >= 365`. They cannot
   both be right, and neither matches the Jahresfrist for a holding period
   spanning a leap day. `crypto-replay.ts` feeds the §23 numbers in
   `anlage-so.ts`, so the `> 365` branch is the one with tax consequences.
2. The app's §23 FIFO is unconditional and not wallet-scoped, whereas BMF
   Rn. 61 makes it a wallet-scoped simplification option subject to
   method-consistency. Defensible as an implementation choice; it should be a
   documented one.

### (c) Tax-advice reading

This is the clearest instance on the page. "So you know whether you owe
anything" is a **legal conclusion about the reader's own liability**, stated to
an anonymous German visitor, with a specific euro threshold attached. Behind a
login it was a product claim to someone who had already accepted terms; on an
indexed page it reads as advice. Design §8/Q4 prohibition 6 bars tax-adjacent
copy from stating a threshold or a legal conclusion — this sentence does both.

### Proposed wording

Preferred — keeps the orientation value, drops the threshold and the
conclusion, and matches what the app actually does:

> "Separates §22 Nr. 3 staking income from §23 private-sale gains, tracks the
> one-year holding period, and shows each bucket against its own Freigrenze."

If a figure is wanted, it must be attached to the right paragraph and
qualified, and it then needs the §3 disclaimer:

> "§22 Nr. 3 staking income against its own €256 Freigrenze, §23 private sales
> against theirs — two separate cliffs, tracked apart, with the one-year
> holding period applied per lot."

Either way: replace "365-day" with "one-year", and delete "so you know whether
you owe anything".

---

## 3. Hero — "a ready-to-type Anlage KAP / SO draft each January"

> "Track stocks, ETFs, bonds, dividends and crypto across Freedom24, Interactive
> Brokers and Coinbase, then export a ready-to-type Anlage KAP / SO draft each
> January."

**Verdict: NEEDS DISCLAIMER.** The sentence itself is accurate and may stay.

### (a) As German tax law

Naming the artefacts is expressly permitted (design §8/Q4). No rate, threshold
or Zeile number is stated. "Draft" is well chosen — it does not claim to be a
filing.

"Each January" is loose but defensible: the return for year N is filed in N+1,
the general deadline is 31 July of N+1, and January is simply the earliest the
year is complete. It is a statement about when the user can run the export, not
a claim about a statutory date. No change required.

### (b) As a description of this app

True. The app builds KAP/KAP-INV drafts (`src/lib/tax/german-tax.ts`,
`kap-inputs.ts`, `elster-fields.ts`) and an Anlage SO draft
(`src/lib/tax/anlage-so.ts`), with PDF and CSV export for both.

### (c) Tax-advice reading — the actual problem

Every other tax surface in this product carries a caveat. The landing page is
the only one that does not, and it is the only one a stranger will read first:

| Surface | Caveat |
|---|---|
| `src/lib/tax/export-pdf.tsx:115`, `:238` | "Personal record only. Not a certified tax filing. Verify with your Steuerberater." |
| `src/lib/tax/export-pdf-so.tsx:155` | "…filing. Verify with your Steuerberater before submission." |
| `src/app/(app)/tax/[year]/anlage-so/page.tsx:191` | "FIFO against opened lots from buys + staking rewards. Confirm with your Steuerberater before filing." |
| `src/lib/tax/german-tax.ts` (multiple warnings) | "Verify with your Steuerberater." |
| **`src/app/(marketing)/page.tsx`** | **none** |

"Ready-to-type", plus card 1's "the Z-line numbers you type into ELSTER,
computed for you", plus card 2's "you know whether you owe anything", add up to
an unqualified promise that a stranger can file from this app's output. The
product's own convention answers this; the landing page just has not inherited
it.

### Proposed addition

One line in the existing trust section (`{/* Trust line */}`), styled like the
neighbouring `font-mono text-[11px] text-dim` paragraph:

> "Folio produces a draft for your own records — not a certified tax filing and
> not tax advice. Check the figures with your Steuerberater before you file."

This is also the disclaimer that would let a corrected figure survive in card 2
if the author wants to keep one.

---

## 4. Follow-ups for the conductor (not landing-page copy)

1. **Route to `developer`:** the copy changes in §1, §2 and §3.
2. **Route to `developer` / `tester` separately:** the
   `days > 365` vs `days >= 365` disagreement between `crypto-replay.ts:67` and
   `replay.ts:249`, and whether either matches the Jahresfrist across a leap
   day. This is a live tax-logic defect independent of the landing page and
   deserves a golden fixture (a lot bought 2024-02-01 and sold 2025-02-01).
3. **Route to `documentation-writer`:** `docs/` cites BMF sources for the KAP
   loss buckets (BMF v. 14.05.2025) and the Vorabpauschale Basiszins, but
   **nothing cites a BMF source for the crypto §22/§23 module**. The governing
   circular is BMF v. **06.03.2025, GZ IV C 1 - S 2256/00042/064/043**; the
   §22 "zusammen mit anderen Einkünften aus Leistungen" qualifier (Rn. 45), the
   Einzelbetrachtung/FIFO Wahlrecht (Rn. 61) and the no-ten-year-extension
   ruling (Rn. 63) should be recorded against `src/lib/tax/anlage-so.ts`.
4. **Unverified, flagged not approved:** the effective date of the §23
   600 → 1 000 uplift at `anlage-so.ts:33-35`. The current consolidated statute
   reads €1 000 and § 52 EStG carries no transitional rule for § 23 Abs. 3
   Satz 5; I did not retrieve the amending act, so the pre-2024 €600 branch is
   unconfirmed by this review.
