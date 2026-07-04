# Vorabpauschale (§18 InvStG) — design for accumulating-ETF tax handling

Status: **v1 (guard layer) implemented · v2 (full computation) designed, not built**

## 1. How the app computes taxes today (analysis)

```
broker statements ──parse──▶ transactions (EUR via ECB daily FX at event date)
                                   │
                                   ▼
                        replay() — FIFO, split-aware
                                   │
                     lots + realized_matches (gainEur = proceedsEur − costEur,
                      each converted at its OWN date ⇒ German EUR-basis method)
                                   │
                                   ▼
   getTaxData / loadTaxInputs ── buildKapInputs (account scope §23-crypto out,
                       Zufluss accrual filter, ISIN-first classification)
                                   │
                                   ▼
                buildKapAndKapInv (pure) ──▶ GermanTaxDraft
   KAP:      Z19 total · Z20 stock gains · Z22 non-stock losses · Z23 stock
             losses · Z51/52 foreign WHT (per-broker matching, treaty caps)
   KAP-INV:  Section 1 Z4–8 fund DISTRIBUTIONS by Teilfreistellung subtype
             Section 2 Z14–26 fund SALE results (clamped ≥0 + warnings)
   plus:     §20 Abs.6 bucket isolation for the dashboard (applyBucketIsolation),
             Sparer-Pauschbetrag, warnings[], per-broker evidence/reconciliation
```

Classification: `instrument_meta` (justETF/Yahoo scrape) → broker-declared
`instruments.kind` (FF `instr_kind`, IBKR Asset Category) → hardcoded maps.
`distributionPolicy` ("DISTRIBUTING" | "ACCUMULATING") comes from justETF and
is already surfaced in the positions UI — **but until this change the tax
layer ignored it entirely.**

### The gap

For an accumulating (thesaurierender) fund there are no distributions, so
Section 1 stays empty and the report *looks* complete while being **legally
wrong**: German law taxes a fictitious minimum yield every year (the
Vorabpauschale) precisely so accumulating funds can't defer tax forever.
A foreign broker (IBKR/FF) neither reports nor withholds it — the statement
itself is silently "incorrect" from a German-tax perspective. Worse, a later
SALE of an Acc fund must be reduced by previously-taxed Vorabpauschalen
(§19 InvStG), which a naive FIFO gain overstates.

## 2. The law (InvStG 2018), condensed

For every investment fund (Dist AND Acc — Dist funds usually net to zero):

```
Basisertrag(Y)     = fund value at Jan-1 of Y × Basiszins(Y) × 0.7
Vorabpauschale(Y)  = max(0, min(Basisertrag(Y) − distributions(Y),
                                max(0, value(Dec-31) − value(Jan-1))))
```

- **Basiszins** is published by the BMF each January (from Bundesbank data).
  Values: 2018 0.87 % · 2019 0.52 % · 2020 0.07 % · 2021 −0.45 %→0 ·
  2022 −0.05 %→0 · 2023 2.55 % · 2024 2.29 % · 2025 2.53 %.
  (Zero/negative Basiszins ⇒ Vorabpauschale 0 for that year — why nobody
  noticed 2021/2022.)
- **Pro-rata for purchases during Y**: reduced by 1/12 for each *full month
  preceding* the month of acquisition (buy in March ⇒ 10/12).
- **Zufluss timing (critical!)**: the Vorabpauschale for holding-year Y is
  deemed received on the **first working day of Y+1**. ⇒ The tax report for
  year **T** must include the Vorabpauschale computed from holdings and
  prices of **T−1**, using Basiszins(T−1).
- **Teilfreistellung** applies (30 % Aktienfonds etc.) — same as
  distributions; ELSTER applies it when the GROSS value is entered on
  Anlage KAP-INV (consistent with how we fill Z4–8).
- **Where it goes**: Anlage KAP-INV, the "Vorabpauschalen" block directly
  below the distributions block — per fund subtype, mirroring Z4–8
  (2020-era form: Zeilen 9–13; EXACT 2025 Zeile numbers must be verified
  against the official form before wiring the draft — same caveat process
  we used for the Z19/Z20/Z22/Z23 split).
- **Sale (§19)**: taxable sale gain = FIFO gain − Σ Vorabpauschalen already
  taxed on the sold shares during the holding period (no double taxation).

## 3. v1 — the guard layer (IMPLEMENTED)

Goal per product owner: no Acc holdings exist today, but an Acc ETF entering
the portfolio must never silently corrupt the report. Every affected number
gets a loud, specific warning; no silent wrong output.

1. **Pure math module** `src/lib/tax/vorabpauschale.ts`
   - `BASISZINS_PCT: Record<number, number>` (BMF table above, with source
     comments; missing year ⇒ computation refuses and the guard warns).
   - `computeVorabpauschale({ startValueEur, endValueEur, distributionsEur,
     basiszinsPct, monthsFactor })` → EUR string. Fully unit-tested. This is
     the v2-ready core; v1 only ships + tests it (no automatic wiring,
     because year-start market values per lot are not reliably available yet).
   - `acquisitionMonthsFactor(acquiredAt, holdingYear)` → 12ths reduction.
2. **Detection** in `buildKapInputs` (has tx + matches + classification):
   - `accumulating` flag added to the classification record entries
     (from `ClassificationOverride.distribution.policy === "ACCUMULATING"`,
     i.e. justETF metadata; symbol- AND isin-keyed like `kind`).
   - Reconstruct **net quantity at Dec-31 of T−1** per accumulating identity
     from TRADE events (Zufluss timing above). Net > 0 ⇒ exposure.
   - Collect accumulating identities with a **sale match in T**.
   - Passed to the builder as `input.accumulatingFunds`.
3. **Warnings** in `buildKapAndKapInv` (so page, PDF, CSV and checklist all
   inherit them through the existing warning pipeline):
   - Held at end of T−1: *"«SYM» is an accumulating fund held on 31.12.(T−1).
     The Vorabpauschale for (T−1) is taxable income of (T) (§18 InvStG,
     Zufluss first working day) and is NOT included in this draft — foreign
     brokers do not report it. Compute it (Jan-1 value × Basiszins(T−1) ×
     0.7, capped at the year's value gain) and enter it on Anlage KAP-INV."*
   - Sold in T: *"«SYM» is an accumulating fund sold in (T). §19 InvStG:
     reduce the sale gain by Vorabpauschalen already taxed in prior years —
     this draft shows the UNREDUCED FIFO gain."*
   - Dist funds and stocks: zero behavior change (goldens byte-identical).

## 4. v2 — full automatic computation (DESIGNED, not built)

Prerequisites and build order:

1. **Prices**: year-boundary NAV per fund — sources in priority order:
   `quote_history` (Yahoo backfill), justETF quote API (has date-addressable
   chart endpoint), broker POSITION_SNAPSHOT rows. Persist a
   `year_end_prices(isin, year, close, currency, source)` cache filled by a
   Jan cron.
2. **Per-lot Vorabpauschale ledger**: table `vap_ledger(ownerUserId, isin,
   lotFingerprint, holdingYear, vapEur, monthsFactor, basiszinsPct,
   enteredInTaxYear)` computed once per year per open lot (pro-rata via lot
   `openedAt`). Needed both for the KAP-INV lines and the §19 sale reduction.
3. **Draft extension**: `kapInv.vorabpauschale` block mirroring section1
   (subtype split, gross EUR, ELSTER applies Teilfreistellung). Verify the
   official 2025/2026 Zeile numbers first (expected Z9–13). PDF/card/CSV
   render it like the other sections; evidence rows get
   `formTarget: KAP_INV_VAP_*`.
4. **§19 sale adjustment**: at match level, subtract `Σ vap_ledger` rows of
   the sold lot from the Section-2 gain, with an evidence line showing the
   reduction. Cap: reduction can't turn a taxed VAP into a double-counted
   loss beyond actual gain rules — mirror the statutory wording, add golden
   tests from the BMF examples.
5. **Dist funds too**: distributions reduce Basisertrag; if distributions <
   Basisertrag the difference is a (small) Vorabpauschale even for Dist
   funds — v2 computes it uniformly; v1 deliberately warns only for Acc
   (materiality).
6. **Ops**: BMF publishes Basiszins each January → constants update +
   test; the Jan cron computes the ledger for the just-ended year and the
   tax page for the new year picks it up automatically.

## 5. Invariants (enforced by tests)

- A portfolio with no accumulating funds produces a byte-identical draft to
  pre-guard behavior (existing goldens).
- An accumulating fund held over a year boundary ⇒ ≥1 warning naming the
  symbol, the holding year, and the target form — in the draft, the PDF, and
  the ELSTER card.
- An accumulating fund sold ⇒ §19 warning attached to the same draft.
- `computeVorabpauschale` reproduces the BMF arithmetic: zero-Basiszins
  years ⇒ 0; value-loss years ⇒ 0; cap at value gain; distribution
  reduction; 1/12 pro-rating.
