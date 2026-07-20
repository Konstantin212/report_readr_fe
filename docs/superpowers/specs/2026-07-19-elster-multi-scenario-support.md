# Folio → ELSTER: multi-scenario Anlage KAP / KAP-INV support

**Status:** spec, not yet planned into tasks.
**Written:** 2026-07-19, immediately after walking the real ELSTER 2025 form
field-by-field for one live filing.
**Evidence log:** `docs/elster-anlage-kap-2025-gaps.md` — every claim marked
VERIFIED there was read off the live form or its official help text.

---

## 1. What the walkthrough actually proved

One user filed a berichtigte Erklärung using Folio's generated draft. Walking
all thirteen Anlage KAP sections plus five KAP-INV sections against the live
form produced a refund of €1.196,46, of which **€498,98 came purely from
correcting Folio's own output**. It also exposed that Folio was wrong in ways
that would have been worse for almost any other user.

Three findings define the work:

**1. Folio guessed the line numbers.** `KAP_Z51` / `KAP_Z52` — which Folio
printed as "Ausländische Quellensteuer" — are, on the real form, the
*Steuernummer of a foreign family foundation* and *its income* (§15 AStG,
section 12). The creditable foreign tax actually lives in **Zeile 41**. A user
who trusted the PDF would have declared a foreign foundation they do not have.
This is not an off-by-one; it points at an unrelated section of the form.

**2. Folio got the arithmetic shape wrong.** Zeile 19 was emitted gross
(€917) with losses as separate positive magnitudes. The form's own wording is
decisive — Zeilen 22/23 are *"In den Zeilen 18 und 19 **enthaltene**
Verluste"*, and the help text says disposals go in Zeile 19 and
*"**zusätzlich**"* into 20/22/23. ELSTER's computation confirmed it
empirically:

| Zeile 19 entered | Kapitalerträge ELSTER derives | Zwischensumme |
|---|---:|---:|
| −1398 (net) | 331 | **1.302** ✓ |
| 917 (gross) | 917 − 586 + 87 + 2.228 = 2.646 | **3.584** ✗ |

That 3.584 is the €3.611 the user originally over-declared. The bug and the
loss were the same object.

**3. Folio's instructions were wrong for half the form.** Every export tells
the user to "enter the LARGE whole-euro number — no decimal separator". True
for income lines; **false for section 8**, where Zeilen 37/38/39/41 take euros
and cents (8,35 / 0,46 / 20,30) and 40/42 literally show a `Euro, Cent`
placeholder. Following our own instruction would have entered 20 instead of
20,30 and silently discarded creditable tax.

Underneath all three is one root cause:

> **Folio models its own idea of the tax computation, then labels the results
> with Zeile numbers derived informally. It has never modelled the form.**

That is survivable for the author, who can check each number by hand. It is not
survivable for a stranger, who will type what the PDF says.

---

## 2. The second root cause: one taxpayer archetype

Every scenario Folio handles today is the author's own: unmarried, not a church
member, marginal rate above 25 %, foreign brokers only, plain shares and equity
ETFs, no derivatives, no defaults, no private lending. Everything outside that
is either silently absent or silently wrong.

Concretely, from the walkthrough:

- **Kirchensteuer does not exist in the codebase.** Zeile 6 (declaration), 39
  (withheld) and 45 exist on the form. Roughly a third of German taxpayers are
  church members. For them Folio produces an incomplete return with no warning.
- **A Steuerbescheinigung cannot be entered.** `buildKapAndKapInv` accepts
  `domesticCertificates` and routes them correctly, but nothing stores or
  captures them — so Zeile 7 printed **0** while the user's certificate said
  33,40. Any user with a German bank hits this on their first filing.
- **Zeile 17 is hardcoded to 0** with the comment "let ELSTER auto-allocate".
  That is correct only for someone whose sole German account is the one being
  declared. Anyone with a Freistellungsauftrag elsewhere under-reports.
- **Whole categories have no code path:** Termingeschäfte (21/24),
  uncollectible Kapitalforderungen (25), domestic income without withholding
  (18), Finanzamt interest (26/26a), tariff-taxed capital income (27–34),
  Spezial-Investmentanteile (34), Alt-Anteile (KAP-INV 15/16/18/19/21/22/24/25/27/28).
- **The one warning we do emit is unconditional.** `buildReconciliation` warns
  about Freedom equity swaps for *every* Freedom user, whether or not any exist.
  It fired for this filing, sent us chasing a phantom €10, and the database
  turned out to contain no swap rows at all in any year. A warning that always
  fires carries no information and teaches users to ignore warnings.

---

## 3. Scenario matrix

This is the part that must drive the design. Each row is a real branch in
what the correct output looks like.

### 3.1 Taxpayer status

| Dimension | Values | What changes |
|---|---|---|
| Filing status | single / **Zusammenveranlagung** | Pauschbetrag €1.000 vs €2.000; **one Anlage KAP per spouse**; Zeile 4's own text references the spouse's attached Anlage KAP. **The offset ORDER also inverts** — see the note below |
| Church membership | none / member | Zeile 6 checkbox, Zeile 39 + 45 amounts, 8 % (BY, BW) vs 9 % rate |
| Marginal rate | above / below ~25 % | Günstigerprüfung (Zeile 4) becomes worth ticking below ~25 %; it also raises the *zumutbare Belastung* base, which interacts with Anlage Außergewöhnliche Belastungen |
| Prior-year carryforward | none / has Feststellungsbescheid | Opening loss pots must be seeded; currently assumed zero. **Declared** input from the Bescheid, never derived — see `2026-07-19-carryforward-planner.md` |

**Offset ordering is filing-status-dependent** (BMF v. 14.05.2025, verified
2026-07-19):

- **Single filer:** losses are consumed FIRST, the Sparer-Pauschbetrag second —
  *"Ein Freistellungsauftrag wird somit erst nach Berücksichtigung des
  Verlustverrechnungstopfes angewendet (verbraucht)."* Allowance volume can
  revive ("aufleben") when a later loss displaces an earlier use of it.
- **Zusammenveranlagung:** the order **inverts** — the Freistellungsauftrag is
  applied first, and cross-spouse offsetting happens after. The BMF explicitly
  rejects the reverse as *"eine nicht zu rechtfertigende Benachteiligung von
  Ehegatten/Lebenspartnern gegenüber Einzelpersonen"*, because offsetting first
  would deny the earning spouse their Pauschbetrag.

So the `married-joint` persona is not "the single path with a doubled
allowance" — it is a different computation order, and Plan 3 must model it as
one.

### 3.2 Institution mix

| Scenario | Routing |
|---|---|
| Foreign brokers only *(today's only supported case)* | everything → Zeile 19 |
| German paying agent, tax withheld | → Zeile 7 + 37/38/39, from a Steuerbescheinigung |
| German paying agent, no withholding | → Zeile 18 |
| Both | both paths simultaneously; Pauschbetrag allocation across them |
| Freistellungsauftrag used elsewhere | Zeile 17 non-zero |
| German agent already credited foreign tax | Zeile **40** (not 41) |
| Foreign tax not yet credited | Zeile **41** |
| Treaty notional credit | Zeile 42 (fiktive Quellensteuer) |

### 3.3 Instruments

| Instrument | Lines | Notes |
|---|---|---|
| Shares | 19 + 20 / 23 | supported |
| Bonds sold at a loss | 19 + 22 | supported |
| **Bond default / worthless write-off** | **25 only** | *excluded* from 19. Folio cannot distinguish this from a sale. Offset restriction abolished — see §3.3a |
| **Worthless share (wertloser Verfall)** | 19 + **23** | lands in the **Aktien** pot per BMF 14.05.2025, so it CAN consume an Aktien carryforward — unlike a fund loss |
| **Termingeschäfte gains, Stillhalterprämien** | 19 + 21 | not supported |
| **Termingeschäfte losses** | **24 only** | *excluded* from 19. Asymmetric with gains. Offset restriction abolished — see §3.3a |
| Equity funds (30 % TF) | KAP-INV 4 / 14 | supported |
| Mixed funds (15 % TF) | KAP-INV 5 / 17 | classification path exists, untested |
| Domestic property funds (60 % TF) | KAP-INV 6 / 20 | untested |
| Foreign property funds (80 % TF) | KAP-INV 7 / 23 | untested |
| Other funds (0 % TF) | KAP-INV 8 / 26 | fallback + warning |
| Accumulating funds | KAP-INV 9–13 | Vorabpauschale — not computed |
| **Alt-Anteile (pre-2009)** | KAP-INV 15/16, 18/19, 21/22, 24/25, 27/28; KAP 10, 29 | no concept |
| Life insurance | KAP 30 | no concept; also feeds Zeile 16 |
| Private loans, stille Gesellschaft | KAP 28/29 | no concept |
| CFC income (§10 AStG) | KAP 27/27a, 47/48 | no concept |
| Family foundation (§15 AStG) | KAP 49–54 | no concept |
| Spezial-Investmentanteile | KAP 34 | no concept |
| Crypto | Anlage SO | correctly excluded from KAP already |

### 3.3a Loss buckets — CORRECTED 2026-07-19 against BMF v. 14.05.2025

An earlier draft of this spec treated Termingeschäfte and worthless
Kapitalforderungen as separately ring-fenced loss buckets. **That is no longer
the law.** JStG 2024 struck §20 Abs. 6 Sätze 5 and 6 without replacement — the
former €20.000 annual offset cap on Termingeschäfte losses and the parallel cap
on wertlose Kapitalforderungen are gone. The statute now has five Sätze and
S. 5 is the Bescheinigung rule.

Transitional rule, per the BMF-Schreiben v. 14.05.2025: losses previously booked
under S. 6 a. F. **move into the *sonstige* pot** (§20 Abs. 6 S. 1–3), for both
the Kapitalertragsteuerabzug and carryforwards already assessed. Existing
carryforwards from those categories are now offsettable against all capital
income in every open case.

**Keep two things apart when implementing:**

| | Status |
|---|---|
| Offset **restriction** (which gains a loss may absorb) | **abolished** for Termingeschäfte and wertlose Kapitalforderungen |
| Reporting **line** (where the figure is entered) | **still required** — Zeilen 21/24/25 exist on the 2025 form and the help text still says losses go *"ausschließlich"* in 24 / 25 |

A reporting obligation is not an offset restriction. Plan 4 must still route
these to their own lines and still keep Termingeschäfte losses out of Zeile 19 —
it just must not model them as a restricted offset bucket.

**The only surviving ring-fence is Aktien** (§20 Abs. 6 S. 4): share-sale losses
offset share-sale gains and nothing else. Note that a share becoming worthless
counts as an Aktien loss — *"Verluste aus dem wertlosen Verfall von Aktien sind
Verluste im Sinne des § 20 Absatz 6 Satz 4 EStG"* — so it feeds Zeile 23, not
the sonstige pot.

Sources and the resolved ordering questions: see
`2026-07-19-carryforward-planner.md` §7.

### 3.4 Filing situation

| Scenario | Requirement |
|---|---|
| First filing for a year | current assumption |
| **Berichtigte Erklärung** | every value overwrites an existing one; stale leftover fields are the hazard; needs a diff against what was filed |
| Multiple tax years | supported |
| Partial statement history | a sale with no matching buy lot must warn, not silently book full proceeds as gain |

### 3.5 Deployment

| Scenario | Status |
|---|---|
| Multiple independent users | **already correct** — `owner_user_id` scoping held up under audit and correctly excluded another person's IBKR account. Add a regression test so it is never "fixed" |
| One user holding a spouse's accounts | undefined today; matters for Zusammenveranlagung |

---

## 4. Architectural direction

### 4.1 Make the form the model

Introduce a declarative **field registry** — one entry per ELSTER line —
that becomes the single source of truth for labels, precision, sign, routing
and applicability. Sketch of the shape (not final):

```ts
type ElsterField = {
  form: "KAP" | "KAP_INV";
  section: number;          // 5
  zeile: string;            // "19", "26a", "27a"
  caption: string;          // verbatim German, as printed on the form
  kind: "amount" | "checkbox" | "text" | "enum";
  precision: "whole_euro" | "euro_cent";
  sign: "signed" | "magnitude";
  // How this line relates to others — this is what encodes "enthaltene"
  // vs "ausschließlich" and prevents a repeat of the Zeile 19 bug.
  inclusion:
    | { kind: "standalone" }
    | { kind: "contained_in"; parent: string }   // "zusätzlich" → also in parent
    | { kind: "excluded_from"; parent: string }; // "ausschließlich" → never in parent
  source: "derived" | "declared" | "answered";
  appliesWhen?: (profile: TaxProfile) => boolean;
};
```

What this buys, mapped directly to the three findings:

- **Wrong labels become impossible** — the caption travels with the number.
  There is no separate `KAP_LABELS` map in the PDF renderer and another in the
  card component to drift apart. (Today there are exactly that: two copies.)
- **Precision becomes per-line** — the export stops telling users to round
  8,35 to 8.
- **Netting becomes declarative** — `contained_in` says Zeile 20 is part of
  Zeile 19, so the emitter subtracts loss magnitudes from the parent instead
  of a hand-written accumulator. `excluded_from` expresses Zeilen 24 and 25.
- **Coverage becomes visible** — a line with no `source` wired up is a known
  gap the UI can name, instead of an absent field the user never learns about.

### 4.2 Three sources of truth, not one

Folio currently treats every number as *derived from transactions*. The form
does not work that way:

- **derived** — disposals, dividends, interest. Computed from imports.
- **declared** — a Steuerbescheinigung (§45a EStG). Legally authoritative and
  *not recomputable*: the statements show net interest and never mention the
  German tax. The €11,53 gap between Revolut's certified €33,40 and our parsed
  €21,87 is unresolved and probably unresolvable from transactions alone. Z7 is
  declared, full stop.
- **answered** — things no importer can ever see: church membership, a
  Freistellungsauftrag at another bank, a life-insurance payout, a private
  loan, a ≥25 % shareholding, a prior-year Verlustvortrag.

Section 6 of the form is entirely `answered`. Folio should not pretend to
compute it, but the checklist must **ask**, because a user who only reads
Folio's output will never learn those lines exist. Note that Zeilen 30 and 33
feed the Zeile 16 Pauschbetrag calculation, so failing to ask also corrupts a
line we *do* emit.

### 4.3 Honest coverage reporting

Replace the current unconditional caveat with a computed coverage statement:
which sections Folio filled, which it left to the user, and which it could not
assess because it lacks data. A warning must fire on a detected condition, never
on the mere presence of a broker.

---

## 5. Subsystem breakdown

Per the writing-plans scope check, these are independent enough to warrant
separate implementation plans. Order matters: 1 unblocks everything else.

### Plan 1 — Field registry + emission rewrite *(P0, unblocks all)*
Build the registry for KAP and KAP-INV with verbatim captions. Rewrite
`buildAnlageKap` to emit through it. Fixes: Zeile 19 netting, `Z52` → `Z41`,
dropping the phantom `Z51`, per-line precision, and the duplicated label maps
in `export-pdf.tsx` and `elster-values-card.tsx`. Goldens change here,
deliberately, once.

### Plan 2 — Declared inputs: certificates
Table + settings form for Steuerbescheinigungen. Fields per §45a: issuer,
Kapitalerträge (Z7), Pauschbetrag in Anspruch genommen (Z16), KESt (Z37), SolZ
(Z38), Kirchensteuer (Z39). Multiple certificates sum. Warn when tax was
withheld while the Pauschbetrag went unused — that user should file a
Freistellungsauftrag.

### Plan 3 — Answered inputs: the profile questionnaire
`TaxProfile`: filing status, church membership + Bundesland, estimated
marginal rate, other-bank Freistellungsauftrag amount, prior-year carryforward,
and a short "do you have any of these?" list for section 6. Drives
`appliesWhen`, the Günstigerprüfung recommendation, and the Pauschbetrag
(€1.000 / €2.000).

### Plan 4 — Instrument classification completeness
Termingeschäfte detection (gains → 21, losses → 24, never netted); default /
write-off vs sale (25 vs 22); worthless shares → the **Aktien** pot (Zeile 23,
not sonstige); fund subtype coverage for 15/60/80 % TF; the sell-without-lot
warning. Each gets a conditional warning when detected and silence when not.

**Read §3.3a first.** These lines are a *reporting* requirement, not a
restricted offset bucket — JStG 2024 abolished the Termingeschäfte and
Kapitalforderung offset caps. Building them as ring-fenced pots would encode
repealed law.

### Plan 5 — Vorabpauschale
Now well understood — ELSTER's own section 4 exposes the full derivation, and
this filing's figures were reproduced exactly from the database. Formula:
Basisertrag = value at 1 Jan × Basiszins × 70 %; Vorabpauschale =
min(Basisertrag, Wertsteigerung) − distributions, floored at 0, reduced 1/12
per full month before acquisition, × units. Needs per-fund Jan-1/Dec-31 NAVs
and a Basiszins table. Also needs §19 InvStG basis tracking so accumulated
Vorabpauschalen reduce a later sale gain.

### Plan 6 — Correction-filing workflow
Diff the current draft against the previously filed values; show what changed
and why. Directly serves the berichtigte-Erklärung case, where a stale field
left behind is the main risk.

### Plan 7 — Persona golden suite
See below. Should land alongside Plan 1 and grow with each later plan.

---

## 6. Testing strategy: personas, not fixtures

The current tax tests encode one taxpayer. Replace with named personas, each a
committed fixture plus an expected full form output:

| Persona | Exercises |
|---|---|
| `foreign-only-single` | today's case; locks the Zeile 19 net decomposition |
| `german-bank-with-certificate` | Z7/16/37/38, declared-vs-derived |
| `church-member` | Z6, Z39, Z45, rate by Bundesland |
| `married-joint` | €2.000 Pauschbetrag, two Anlagen |
| `derivatives-trader` | Z21 vs Z24 asymmetry — gains in 19, losses not |
| `bond-default` | Z25 vs Z22 |
| `mixed-fund-holder` | 15/60/80 % Teilfreistellung |
| `accumulating-etf-holder` | Vorabpauschale end to end |
| `low-marginal-rate` | Günstigerprüfung recommended |
| `partial-history` | sell-without-lot warns rather than inventing a gain |

Two invariants every persona must satisfy:

1. **No `ZeileValue` is negative except where the registry says `signed`.**
2. **For every `contained_in` line, parent = sum of its own components
   including the contained magnitudes.** This is the Zeile 19 bug expressed as
   a property, so it cannot come back in a different line.

Plus one end-to-end regression: the `foreign-only-single` persona must
reproduce €1.302 as the Zwischensumme and €0 as §32d income — the figures
ELSTER itself computed on 2026-07-19.

---

## 7. Non-goals

Explicitly out of scope, to be stated in the UI rather than half-built:

- Anlage KAP-BET (Beteiligungen) — referenced by several captions, no user need yet.
- CFC income (§10 AStG), family foundations (§15 AStG), Spezial-Investmentanteile.
- Alt-Anteile pre-2009 — plausible for older users, but needs pre-2009 history
  no importer has.
- Filing *to* ELSTER programmatically. Folio produces values a human types.
  ERiC integration is a different product with different liability.
- Anything that would let Folio present itself as tax advice. Every export
  keeps the Steuerberater disclaimer.

---

## 8. Open questions

1. **The €11,53 Revolut gap.** Certificate Zeile 7 = 33,40 vs parsed savings
   interest 21,87. All 7 savings pots are in the one export, and the gap
   exceeds the certificate's own 8,81 of withholding, so neither
   missing-accounts nor gross-vs-net explains it. Needs Revolut's own interest
   breakdown. Does not block filing — the certificate is authoritative — but
   until it is closed, Z7 must stay `declared` and must never be derived.
2. **Gain/loss split granularity.** Folio splits per FIFO lot; a hand
   reconciliation netting per disposal gave Z20 495,08 / Z23 −2.138,00 against
   Folio's 585,53 / −2.228,45. Identical net, identical tax, identical
   carryforward — but both cannot be what the Finanzamt expects in Zeile 20.
   Decide deliberately and document.
3. **Does Zeile 9 (KAP-INV) auto-sum from Zeile 45?** It held a stale 10 while
   its own derivation produced 9. If ELSTER does not auto-sum, Folio should
   emit both and flag the inconsistency.
4. **Rounding direction.** ELSTER truncated a Vorabpauschale of 9,9672 down to
   9, and credited a withheld 8,35 as 9,00 — i.e. rounded *toward the
   taxpayer* in both directions. Confirm the rule before matching it.

---

## 9. Recommended sequencing

Plan 1 first and alone — it is the foundation, it fixes all three P0 defects,
and it is the only place goldens legitimately change. Then Plans 2 and 3
together, since a certificate without a profile still cannot allocate the
Pauschbetrag correctly. Then 4, 5, 6 in any order. Plan 7 grows continuously
from Plan 1 onward.
