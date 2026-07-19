# Anlage KAP 2025 — gaps found while filing against the real ELSTER form

Status: **open**. Started 2026-07-19 during the user's berichtigte Erklärung for tax
year 2025. Code changes are deliberately deferred until the filing is done — this
file is the running record so nothing is lost.

Every item below was found by comparing Folio's generated KAP draft against the
actual ELSTER form field-by-field. Items marked **VERIFIED** are backed by the
form's own label text or official help text, quoted inline. Items marked
**SUSPECTED** still need confirmation.

---

## P0 — produces wrong money today

### 1. Zeile 19 is emitted GROSS; it must be NET — **VERIFIED**

`buildAnlageKap` accumulates `z19` from positive income only and keeps losses as
separate positive magnitudes in Z22/Z23. For the user's 2025 data that emits
**917** where the correct entry is **−1398**.

Evidence from the live form (both directions say the same thing):

- Field label, Zeile 22/23: *"In den Zeilen 18 und 19 **enthaltene** Verluste …"*
  — losses are *contained in* Zeile 19.
- Official help text, Zeilen 18/19: *"Alle Veräußerungstatbestände tragen Sie
  bitte **zusätzlich** in die Zeilen 20 und/oder 22 und/oder 23 ein."*
  — disposals go in Zeile 19 **and additionally** get broken out.

So Zeile 19 = sum of all foreign capital income *including* disposal gains and
losses; Zeilen 20/22/23 are supplementary breakouts that let the Finanzamt apply
the §20 Abs. 6 ring-fencing. Negative Zeile 19 is a normal case — it is what
produces the Feststellung des Verlustvortrags.

Decomposition of the wrong figure, for the regression test:

```
  297,73  foreign dividends (non-fund)      → Z19
   33,30  interest                          → Z19
  585,53  share gains                       → Z19 and additionally Z20
−2.228,45  share losses                     → Z19 and additionally Z23
−   86,52  bond loss (a real sale)          → Z19 and additionally Z22
─────────
−1.398,41  correct Zeile 19   (app emitted 916,56)
```

**Fix:** subtract the loss magnitudes from `z19` before emission. Keep Z20/Z22/Z23
as non-negative magnitudes — that part is right. Allow `ZeileValue` to be
negative for Z19 specifically; the whole-euro rounding must not clamp at zero.
Golden test must lock the decomposition above, not just the total.

**Blast radius:** `german-tax.ts` emission, the `NOTE FOR HUMAN REVIEW` comment
that currently documents the defect, `elster-values-card.tsx`, `export-pdf.tsx`
checklist text, and every KAP golden.

### 2. Termingeschäfte routing is asymmetric and unimplemented — **VERIFIED**

Help text, Zeilen 18/19:

> "Einkünfte aus Stillhalterprämien und Gewinne aus Termingeschäften tragen Sie
> bitte **zusätzlich** in Zeile 21 ein. Verluste aus Termingeschäften erklären Sie
> bitte **ausschließlich** in Zeile 24."

| Item | Zeile 19? | Own line |
|---|---|---|
| Termingeschäfte **gains** | yes ("zusätzlich") | 21 |
| Termingeschäfte **losses** | **no** ("ausschließlich") | 24 |
| Kapitalforderung uncollectible / written off / worthless | **no** ("ausschließlich") | 25 |

A *net* Termingeschäfte figure is therefore unusable — gains and losses take
different routes and only gains reach Zeile 19. Any implementation must carry the
two sides separately all the way to emission.

Same structure exists on the domestic side and IS rendered by ELSTER: Zeile 9
(gains), Zeile 14 (losses), Zeile 15 (Kapitalforderung).

**Open question:** ELSTER did not render Zeilen 21/24/25 in the user's session
even though 9/14/15 appeared in the domestic section. Cause unknown — possibly a
guided-mode field-hiding feature. Resolve before relying on those lines.

### 3. The Freedom equity-swap caveat cries wolf — **VERIFIED**

Checked 2026-07-19 against the live database: **FRHC appears in no row, in any
year, in any account**, and Freedom's entire 2025 activity is 19 plain buy/sell
trades (VICI, GM, GRAB, HOOD, ENPH, ZIM, NEM, O, JNJ, META, STM, SCHD). There are
no equity swaps in this user's data. The "~90 daily FRHC.US open/close pairs"
described in the older planning doc refer to data that was never imported —
treat that claim as stale.

The real defect is the caveat itself. `buildReconciliation` emits

> "Freedom equity swaps (Termingeschäfte, §20 Abs.2 Nr.3) are not yet
> distinguished by the importer — if you traded any, verify them manually…"

unconditionally on `brokers.has("FREEDOM_FINANCE")`, i.e. for every Freedom user
whether or not a single swap exists. That sent the filer chasing a phantom €10
mid-filing. A caveat that always fires carries no information and trains users to
ignore warnings.

**Fix:** make it conditional on actually detecting swap-shaped rows. If the
importer cannot detect them, the honest form is a one-time note in the docs, not
a per-draft warning. If swaps ever *are* supported, item 2 applies — they need a
gain/loss split, never a net figure.

---

## P1 — the app cannot express things the form requires

### 4. Kirchensteuer is not modelled at all

Two places the form asks and Folio has no answer:

- **Zeile 6** (section 2, Erklärung zur Kirchensteuerpflicht): *"Ich bin
  kirchensteuerpflichtig und habe Kapitalerträge erzielt, von denen
  Kapitalertragsteuer, aber keine Kirchensteuer einbehalten wurde"* — must be
  ticked by a church member whose broker withheld KESt but not Kirchensteuer.
- **Zeile 39** — Kirchensteuer withheld, from a Steuerbescheinigung.

The current user is not a church member so this is inert for them, but roughly a
third of German taxpayers are. Needs a `userSettings` flag (church member y/n +
Bundesland, since the rate is 8 % or 9 %) and a checklist item driven by it.
Without the flag the app silently gives church members an incomplete return.

### 5. Domestic Steuerbescheinigung has no storage or UI

`buildKapAndKapInv` accepts `domesticCertificates` and correctly routes them to
Z7/Z37/Z38, but nothing persists or captures them — so the generated PDF printed
**Z7 = 0** while the user's real certificate says 33,40. Needs a table plus a
settings form. Fields the real Revolut certificate carries, all naming their own
ELSTER line:

| Certificate row | Line |
|---|---|
| Höhe der Kapitalerträge | Zeile 7 |
| in Anspruch genommener Sparer-Pauschbetrag | Zeile 16 / 17 |
| Kapitalertragsteuer | Zeile 37 |
| Solidaritätszuschlag | Zeile 38 |
| Kirchensteuer | Zeile 39 |

### 6. Zeile 16 vs Zeile 17 is a real distinction the app collapses

- **Zeile 16** — Pauschbetrag consumed by income *declared* in Zeilen 7–15, 30, 33.
- **Zeile 17** — Pauschbetrag consumed by income **not** declared in Anlage KAP
  (other German accounts running under a Freistellungsauftrag).

The app hardcodes Z17 = 0 with the comment "let ELSTER auto-allocate". That is
right only when the user has no other German account. Needs to be an input, and
Zeile 16 should come from the certificate rather than being assumed 0.

### 7. Lines with no code path at all

| Zeile | Meaning | Note |
|---|---|---|
| 18 | Inländische Kapitalerträge **without** withholding | e.g. interest on a private loan between unrelated parties |
| 25 | Loss from uncollectible Kapitalforderung / worthless write-off | must NOT be in Zeile 19 |
| 26 | Interest paid by the Finanzamt on tax refunds | |
| 26a | Prozess- und Verzugszinsen | excluded from Zeile 19 by its own label |
| 27, 27a | §10 AStG Hinzurechnungsbetrag (CFC income) | section 6 |
| 28, 29 | Private loans, stille Gesellschaft, partiarische Darlehen | section 6 |
| 30 | Life-insurance proceeds, §20 Abs. 1 Nr. 6 S. 2 | section 6; counts toward Zeile 16 |
| 31–32c | Shareholding ≥ 25 % — Antrag auf tarifliche Besteuerung | section 6 |
| 33 | §32d Abs. 2 Nr. 4 Korrespondenzprinzip / §11 StAbwG | section 6; counts toward Zeile 16 |
| 34 | Spezial-Investmentanteile, §20 Abs. 1 Nr. 3a | section 6 |

**Section 6 is a structural blind spot, not just an unimplemented line.** None of
these arrive on a broker statement — private loans, life insurance, a 25 %
company stake and CFC income are invisible to any importer. Folio should not
pretend to compute them, but the checklist should *ask*, because a filer who only
looks at Folio's output will never learn these lines exist. Note that Zeilen 30
and 33 feed the Zeile 16 Pauschbetrag calculation, so leaving them unasked can
also make Zeile 16 wrong.

Zeile 25 matters beyond completeness: a bond that **defaults** routes to 25, a
bond **sold** at a loss routes to 22. The app cannot currently tell these apart —
it treats every realized match as a disposal. For the user's 2025 figures this
happens to be correct (the €86,52 is a genuine sale, cost 914,93 / 921,17 against
proceeds 874,80), but the distinction is not encoded anywhere.

---

## P2 — correctness of what we already emit

### 8. Foreign-withholding line numbers are WRONG — **RESOLVED 2026-07-19**

Section 8 read directly from the form. The correct mapping:

| Real Zeile | Caption | App today | Correct? |
|---|---|---|---|
| 37 | Kapitalertragsteuer | `KAP_Z37` | ✓ |
| 38 | Solidaritätszuschlag | `KAP_Z38` | ✓ |
| 39 | Kirchensteuer zur Kapitalertragsteuer | — | missing (item 4) |
| 40 | Angerechnete ausländische Steuern | — | missing |
| **41** | **Anrechenbare noch nicht angerechnete ausländische Steuern** | `KAP_Z52` | ✗ **rename to Z41** |
| 42 | Fiktive ausländische Quellensteuer | — | missing |

Consequences to implement:

- `KAP_Z52` → `KAP_Z41`. The value (treaty-capped creditable tax, 20,30) is
  correct; only the line number was wrong. "Anrechenbare" means creditable, so
  the **capped** figure belongs here — US tax above the 15 % treaty rate is
  reclaimable from the IRS, not creditable in Germany.
- **Zeilen 51 and 52 are family-foundation fields** (section 12, §15 AStG):
  Zeile 51 is the foundation's *Steuernummer* (a text input, not an amount),
  Zeile 52 is *Einkünfte einer ausländischen Familienstiftung*, Zeile 53 the
  foreign tax credited against it. A filer who copied our PDF's "Z51 = 21" and
  "Z52 = 20" into those fields would have declared a foreign family foundation
  they do not have. This is the worst mis-mapping found so far — it is not an
  off-by-one, it points at an unrelated section.
- **`KAP_Z51` has no field on the form.** Gross foreign withholding (20,50) is
  informational only. Keep it in the evidence/reconciliation view, but stop
  presenting it as an ELSTER line — printing a "Zeile 51" the filer cannot find
  is worse than omitting it.
- Zeile 40 vs 41 is a real distinction: 40 is foreign tax a *German* paying agent
  already credited; 41 is foreign tax not yet credited. Every foreign broker in
  Folio routes to 41. A domestic Zahlstelle holding foreign securities would
  route to 40 — currently unrepresentable.
- Zeile 42 (fiktive Quellensteuer, notional credit under certain treaties) has no
  concept in the app.

### 8b. Whole-euro advice is wrong for section 8 — **VERIFIED**

`export-pdf.tsx` and `elster-values-card.tsx` tell the user, globally, to "enter
the LARGE whole-euro number — no decimal separator", quoting ELSTER's rejection
message. But **section 8 fields take cents**: the live form holds 8,35 / 0,46 /
0,00 / 20,30, and Zeilen 40 and 42 show a literal `Euro, Cent` placeholder.

So the rule is per-section, not global: income lines are whole euros, tax-credit
lines are euros and cents. The current blanket instruction would push a filer to
enter 8 instead of 8,35 and 20 instead of 20,30 — losing real credit. Each
`FormTarget` needs a precision attribute driving both the display and the
instruction text.

### 8c. Original numbering research note — **SUSPECTED (superseded by 8)**

The app labels foreign WHT as Z51/Z52, derived informally and never checked. The
sidebar section that should hold them reads *"9 — Anzurechnende Steuern zu
Erträgen in den **Zeilen 28 bis 34** sowie aus anderen Einkunftsarten"*, which
does not obviously match. Zeile 19's own label also excludes *"Beträge laut den
Zeilen 26a und 52"*, so a Zeile 52 exists and means something specific.

The **amounts** (20,50 gross / 20,30 capped) reconcile fine; only the line
mapping is in doubt. Capture the real captions when section 9 is reached.

**Evidence gathered so far that Zeile 52 is an INCOME line, not a credit line:**

- Zeile 19 caption: *"Ausländische Kapitalerträge (ohne Beträge laut den Zeilen
  26a und **52**)"* — 52 is something carved out of foreign capital *income*.
- Zeile 35 caption (section 7): *"In den Zeilen 7, 18, 19, 26, 26a und / oder
  **52** … enthaltene Erträge"* — 52 sits in a list of income lines.
- Zeile 16 caption (section 4) enumerates the Pauschbetrag-consuming income lines
  as "7 bis 15, 30 und 33" — 51/52 are absent, as expected for credit lines.

So `KAP_Z51` / `KAP_Z52` are almost certainly mis-numbered in `german-tax.ts`.
The foreign-withholding credit most likely lives in section 9 ("Anzurechnende
Steuern …"). Do not rename anything until the section 9 captions are read — the
amounts are right and only the labels are at risk.

### 9. Evidence CSV disagrees with the PDF on withholding

Every row of `anlage-kap-2025-evidence.csv` has `whtEur` = 0 while the same
draft's PDF reports Z51 = 20,50. The CSV is meant to be the audit trail; an audit
trail that contradicts the summary is worse than none. `whtEur` is presumably
only populated on some evidence paths.

### 10. Gain/loss split granularity is undecided

The app splits per FIFO lot; a hand-reconciliation that netted per disposal
produced a different split for the same year:

| | App (per lot) | Hand (per disposal) |
|---|---:|---:|
| Z20 gains | 585,53 | 495,08 |
| Z23 losses | −2.228,45 | −2.138,00 |
| **net** | **−1.642,92** | **−1.642,92** |

The €90,45 difference is ZIM on 2025-08-20, where one day's sells matched several
lots in both directions. Net, tax, and carryforward are identical either way, so
no money is at stake — but the two numbers cannot both be what the Finanzamt
expects in Zeile 20. Decide the convention deliberately and document it.

### 11. `owner_user_id` scoping is correct — add a regression test

IBKR account `U18558321` belongs to a different user and Folio correctly excludes
it. An earlier hand-audit wrongly folded its €139,63 into this user's dividends
and concluded the app was under-reporting. The app was right. Worth a test that
locks per-owner scoping so nobody "fixes" it back.

---

## P3 — make next year a copy job

### 12. ELSTER label mapping table

The core missing artefact. Every `FormTarget` should carry the ELSTER **section
number**, **Zeile number**, and the **verbatim German caption**, so the export
can be read straight into the form without a human translating. Captured so far:

| Section | Zeile | Caption | FormTarget |
|---|---|---|---|
| 1 Anträge | 4 | Ich beantrage die Günstigerprüfung für sämtliche Kapitalerträge | `KAP_Z4` |
| 1 Anträge | 5 | Ich beantrage eine Überprüfung des Steuereinbehalts für bestimmte Kapitalerträge | *(none)* |
| 2 Kirchensteuerpflicht | 6 | Ich bin kirchensteuerpflichtig und habe Kapitalerträge erzielt, von denen Kapitalertragsteuer, aber keine Kirchensteuer einbehalten wurde | *(none)* |
| 3 Inländ. mit Steuerabzug | 7 | Kapitalerträge | `KAP_Z7` |
| 3 | 8 | In Zeile 7 enthaltene Gewinne aus Aktienveräußerungen | *(none)* |
| 3 | 9 | In Zeile 7 enthaltene Einkünfte aus Stillhalterprämien und Gewinne aus Termingeschäften | *(none)* |
| 3 | 12 | Nicht ausgeglichene Verluste ohne Verluste aus der Veräußerung von Aktien | *(none)* |
| 3 | 13 | Nicht ausgeglichene Verluste aus der Veräußerung von Aktien | *(none)* |
| 3 | 14 | Verluste aus Termingeschäften | *(none)* |
| 3 | 15 | Verluste aus der ganzen oder teilweisen Uneinbringlichkeit einer Kapitalforderung … | *(none)* |
| 4 Sparer-Pauschbetrag | 16 | In Anspruch genommener Sparer-Pauschbetrag, der auf die in den Zeilen 7 bis 15, 30 und 33 erklärten Kapitalerträge entfällt | *(none)* |
| 4 | 17 | In Anspruch genommener Sparer-Pauschbetrag, der auf die in der Anlage KAP nicht erklärten Kapitalerträge entfällt | `KAP_Z17` |
| 5 Ohne inländ. Steuerabzug | 18 | Inländische Kapitalerträge (ohne Beträge laut den Zeilen 26 und 26a) | *(none)* |
| 5 | 19 | Ausländische Kapitalerträge (ohne Beträge laut den Zeilen 26a und 52) | `KAP_Z19` |
| 5 | 20 | In den Zeilen 18 und 19 enthaltene Gewinne aus Aktienveräußerungen i. S. d. § 20 Abs. 2 Satz 1 Nr. 1 EStG | `KAP_Z20` |
| 5 | 21 | Stillhalterprämien / Gewinne aus Termingeschäften *(not rendered — see item 2)* | *(none)* |
| 5 | 22 | In den Zeilen 18 und 19 enthaltene Verluste ohne Verluste aus der Veräußerung von Aktien | `KAP_Z22` |
| 5 | 23 | In den Zeilen 18 und 19 enthaltene Verluste aus der Veräußerung von Aktien i. S. d. § 20 Abs. 2 Satz 1 Nr. 1 EStG | `KAP_Z23` |
| 5 | 24 | Verluste aus Termingeschäften *(not rendered)* | *(none)* |
| 5 | 25 | Verluste aus Uneinbringlichkeit einer Kapitalforderung *(not rendered)* | *(none)* |
| 5 | 26 | Zinsen, die vom Finanzamt für Steuererstattungen gezahlt wurden | *(none)* |
| 5 | 26a | Prozess- und Verzugszinsen | *(none)* |

*(to be completed as remaining sections are walked)*

### 13. Two-column layout: "laut Steuerbescheinigung" vs "korrigierter Betrag"

Section 3 has three columns per line: *Betrag laut Steuerbescheinigung(en)*,
*Korrigierter Betrag (laut Erläuterung)*, and a free-text *Erläuterung*. Folio
emits one number and doesn't say which column it belongs in. Certificate-derived
figures go in column 1; a figure the user disputes goes in column 2 **with** a
written justification. Worth surfacing, since the correction column is exactly
how a filer fixes a broker's mistake.

### 14. eDaten ("F" badge) reconciliation — opportunity, not a gap

ELSTER pre-fills fields the Finanzamt already received from German institutions
and marks them with a pink **F**. Zeile 7's 33 carried that badge. A future
feature could diff Folio's computed figure against the pre-filled eDaten value
and flag mismatches — the strongest possible check on a domestic certificate,
because it compares against what the bank actually reported.

### 15. Correction filings are a first-class workflow

This filing is a *berichtigte Erklärung* over an already-submitted return, so
every value is an overwrite of an existing one, and stale fields left behind are a
real hazard. Folio treats a draft as if the form were empty. A "what changed since
your last filing" diff would make this safe.

---

## Deferred items carried over

- §19 InvStG per-lot Vorabpauschale basis tracking (needs a migration).
- Wiring `buildVorabpauschaleSchedule` into the KAP-INV draft (blocked on
  per-fund Jan-1 / Dec-31 NAVs).
- Revolut certificate reconciliation: certificate Zeile 7 = 33,40 vs parsed
  savings interest 21,87. €11,53 unexplained. Does not block filing — the
  certificate is the legal source under §45a EStG — but blocks *deriving* Z7.
- `ParsedBrokerStatement` has no warnings channel, so uploading only the Revolut
  trading workbook silently yields zero dividend income.
