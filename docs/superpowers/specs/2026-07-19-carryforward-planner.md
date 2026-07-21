# Verlustvortrag planner — turning an assessed loss carryforward into a plan

**Status:** spec, not yet planned into tasks.
**Written:** 2026-07-19, after a real filing produced an assessed Aktien loss
carryforward of €1.642,92 and the obvious next question: how do you actually
use it?

**Companion to:** `docs/superpowers/specs/2026-07-19-elster-multi-scenario-support.md`
(the carryforward is listed there as an unrepresented taxpayer dimension).

**Note (2026-07-21):** during the Positions & Tax redesign (presentational
only, see `docs/CHANGELOG.md`), a display-only `carriedForwardEur` figure
was briefly added to the Loss Harvest panel and caught in review as
incorrect — it did not separate the Aktien/Sonstige buckets §20 Abs. 6
S. 4 EStG requires. It was removed before merge; `src/lib/tax/loss-harvest.ts`
was never touched. A real bucket-separated carryforward display is still
this spec's job, not a redesign's, and must go through `tax-advisor` plus
golden fixtures.

---

## 1. The problem

A German investor who realises more share losses than share gains in a year
gets the excess **assessed** as a Verlustvortrag (§20 Abs. 6 S. 4 EStG). It:

- offsets **only** future gains from selling **Aktien** — not fund/ETF sales,
  not dividends, not interest, not bond gains
- never expires
- cannot be carried *back* to a prior year
- is applied automatically by the Finanzamt once assessed, but only against
  gains the filer actually declares

So it is a standing, non-expiring, single-purpose credit — and it is invisible.
Nothing in Folio knows it exists, and nothing tells the user which of their
holdings could consume it. The realistic failure mode is not misuse; it is a
carryforward sitting unused for years while the user pays tax on ETF gains that
could never have touched it anyway.

**The ETF exclusion is the non-obvious part and the reason this feature earns
its keep.** §20 Abs. 6 S. 4 restricts the offset to *Aktien* i. S. d. §20
Abs. 2 S. 1 Nr. 1. Investmentanteile are taxed under the InvStG and reported on
Anlage KAP-INV — a different bucket entirely. For the user who prompted this,
roughly half the portfolio (SCHD, SPY, VOO, VUSA, VHYL, SPYW) is structurally
incapable of consuming the carryforward. Nothing in the UI says so.

## 2. What the computation actually is

### 2.1 Headroom

Two stacking allowances, in this order — **verified empirically** against the
user's own ELSTER Steuerberechnung of 2026-07-19, which applies loss offsetting
*before* the Sparer-Pauschbetrag:

```
Zwischensumme                              1.302
  Verrechnung laufender Verluste (Aktien)   -586
  Verrechnung laufender Verluste (übrige)    -87
noch nicht ausgeschöpfter Pauschbetrag      -629
Einkünfte i.S.d. § 32d Abs. 1 EStG              0
```

Because losses are consumed first, the carryforward does **not** burn the
Pauschbetrag. They stack:

```
qualifyingHeadroom = carryforward + max(0, allowance − otherCapitalIncome)
```

where `otherCapitalIncome` is dividends + interest + post-Teilfreistellung fund
income + already-realised gains for the year. For the reference user:
€1.642 + (€1.000 − €716) ≈ **€1.926** of share gains at zero tax.

### 2.2 Which holdings qualify

`bucket === "aktien"` in the existing `loss-harvest.ts` model — which already
draws exactly the right line, classifying individual stocks as `aktien` and
ETFs/bonds as `sonstige`. Reuse it; do not invent a second classifier.

### 2.3 FIFO applies to gains too

§20 Abs. 4 mandates FIFO for disposals regardless of direction, so "sell €500
of gain" is not free-form — selling n shares consumes the oldest lots and the
realised gain is a piecewise-linear function of n with kinks at lot boundaries.
This is the exact structure `fifoHarvestPrefix` already walks for losses.

Two consequences:

- The planner must compute, per candidate, the **cumulative gain curve** over
  the FIFO queue, then answer "how many shares to reach target gain G" —
  a prefix scan, not `targetGain / gainPerShare`.
- **Hidden gains exist**, mirroring the module's existing `hiddenLoss` concept:
  a position that is underwater overall can still have profitable *oldest* lots.
  Selling exactly those realises a gain from a red position. Any user reasoning
  from the position-level P/L chip will get this wrong, which is precisely why
  the feature should compute it.

## 3. Architecture

Extend `src/lib/tax/loss-harvest.ts` — or split the shared FIFO primitives into
`src/lib/tax/fifo-prefix.ts` and have both sides import them, if the file has
grown unwieldy by then. The two features are the same machine run in opposite
directions and must not fork.

| Module | Responsibility |
|---|---|
| `fifoGainPrefix(lots, priceEur, targetGainEur?)` | pure; mirror of `fifoHarvestPrefix`. Without a target: the prefix maximising realised gain. With one: the smallest prefix reaching it, plus the actual (over/under-shooting) gain, since lot boundaries rarely land on the target. |
| `buildGainCandidates(rows)` | pure; `aktien`-bucket rows with a positive realisable gain. Mirrors `buildCandidates`. |
| `computeCarryforwardPlan(inputs, sells)` | pure; applies the §2.1 ordering and returns consumed carryforward, remaining carryforward, allowance used, tax due (should be €0 while within headroom). |
| `suggestGainOptimum(inputs)` | pure; greedy selection filling the headroom without exceeding it. Mirrors `suggestOptimum`. |

The carryforward itself is a **declared** input, not derived — it comes from the
Verlustfeststellungsbescheid. It joins the `TaxProfile` proposed in the
multi-scenario spec §5 Plan 3, alongside church membership and filing status.

```ts
type CarryforwardInput = {
  /** Assessed Aktien loss carryforward, per the Verlustfeststellungsbescheid. */
  aktienEur: string;
  /** Sonstige (non-Aktien §20) carryforward, if separately assessed. */
  sonstigeEur?: string;
  /** Assessment year, so the UI can say "as assessed for 2025". */
  assessedForYear: number;
};
```

**Do not attempt to derive the opening carryforward from Folio's own history.**
Folio may not hold every prior year, and the Bescheid is the legally
authoritative figure — the same reasoning that makes a Steuerbescheinigung a
declared input for Zeile 7.

## 4. UI

A `/tax` panel (not a new page — it belongs beside the ELSTER values and the
allowance bar it interacts with):

- **Headroom bar** — carryforward and remaining Pauschbetrag as two stacked
  segments, with the combined figure stated in euros. The stacking is the
  insight; show it as stacked.
- **Qualifying holdings table** — `aktien` rows with realisable gain, FIFO sell
  quantity, and a "hidden gain" flag where the position is red overall.
- **Excluded holdings, shown not hidden.** ETF/fund rows listed greyed with the
  reason: *"Fondsanteile — Gewinne können den Aktien-Verlustvortrag nicht
  verrechnen (§20 Abs. 6 S. 4 EStG)."* Silently omitting them is what leaves the
  user believing their SCHD gain helped.
- **Plan builder** — pick quantities, see carryforward consumed and tax due
  update live. Mirrors the existing harvest page's interaction, including its
  URL-encoded sell params so a plan is shareable.
- Per the standing async-feedback requirement, any recompute that waits on a
  quote refresh shows a spinner and an explicit "Updating…" state.

## 5. Honest framing the UI must carry

This feature suggests realising gains, which is a real financial action with
real costs. Three things must be stated in the UI, not buried:

1. **Selling and immediately rebuying is the mechanism.** Germany has no
   wash-sale rule blocking it. The benefit is a reset (higher) cost basis, so
   the eventual real sale is taxed on less. The cost is spread plus commission —
   which the panel should show against the tax saved, because on a small
   carryforward the spread can exceed the benefit.
2. **It only helps if the gain would otherwise be taxed later.** A buy-and-hold
   investor who never sells, or who plans to bequeath the position, gains
   nothing. Do not present the headroom as free money.
3. **Not advice.** Same Steuerberater disclaimer as the ELSTER export.

## 6. Testing

Pure-function tests only, per repo convention.

| Test | Locks |
|---|---|
| `fifoGainPrefix` — no target | max-gain prefix; plateau handling matches the loss side's first-minimum convention |
| `fifoGainPrefix` — with target | smallest prefix reaching it; over/undershoot reported honestly |
| hidden gain | red position, profitable oldest lots → positive realisable gain |
| bucket exclusion | an ETF row never appears as a qualifying candidate, at any gain size |
| headroom stacking | carryforward + unused allowance, with the §2.1 ordering |
| headroom exhausted | allowance already consumed by dividends → headroom = carryforward alone |
| carryforward larger than any realisable gain | plan reports the unconsumed remainder rather than silently capping |
| **reference persona** | the 2026-07-19 filing: €1.642 carryforward, ~€716 other income, €1.000 allowance → €1.926 headroom |

## 7. Authoritative sources

Checked 2026-07-19. Cite these, not secondary tax-blog summaries.

| Source | Where | Use |
|---|---|---|
| **§ 20 Abs. 6 EStG** | `gesetze-im-internet.de/estg/__20.html` | the statute — five Sätze; S. 4 is the Aktien ring-fence |
| **BMF-Schreiben "Einzelfragen zur Abgeltungsteuer" v. 14.05.2025** | GZ IV C 1 - S 2252/00075/016/070, BStBl 2025 I S. 1330; PDF on bundesfinanzministerium.de | **the operative guidance** — 137 pages, ~300 Rn., worked examples. Replaces the 19.05.2022 version (BStBl I S. 742) |
| Anleitung zur Anlage KAP | ELSTER's per-field help, already transcribed in `docs/elster-anlage-kap-2025-gaps.md` | line-level reporting rules |

### 7.1 Resolved: loss offsetting comes BEFORE the Pauschbetrag

The BMF is explicit (section on the Verlustverrechnungstopf):

> "… ist erst auf den nach Verlustverrechnung verbleibenden abzugspflichtigen
> Ertrag anzuwenden. **Ein Freistellungsauftrag wird somit erst nach
> Berücksichtigung des Verlustverrechnungstopfes angewendet (verbraucht).**"

This confirms §2.1 and matches the reference user's own Steuerberechnung. It also
notes the Freistellungsvolumen can *revive* ("aufleben") when a later loss
displaces an earlier use of the allowance.

### 7.2 Resolved with a caveat: current-year losses vs carryforward

§20 Abs. 6 S. 2: *"Die Verluste mindern jedoch die **Einkünfte**, die der
Steuerpflichtige in den folgenden Veranlagungszeiträumen aus Kapitalvermögen
erzielt."* — *Einkünfte* is the net figure, i.e. already reduced by that year's
own losses. So current-year offsetting runs first and the carryforward applies to
what survives. Strongly implied by the wording and consistent with §10d
mechanics, but no Rn. states it in those words — if a year with both ever
produces a surprising result, re-check before trusting the planner's output.

### 7.3 NEW — for married filers the order INVERTS

The BMF's worked examples show that cross-spouse loss offsetting happens
**after** the Freistellungsauftrag, not before. It explicitly rejects the reverse
ordering as *"eine nicht zu rechtfertigende Benachteiligung von
Ehegatten/Lebenspartnern gegenüber Einzelpersonen"* — because offsetting first
would deny the earning spouse their Pauschbetrag.

So the `married-joint` persona in the multi-scenario spec needs its **own**
ordering, not a doubled allowance bolted onto the single-filer path.

### 7.4 NEW — §20 Abs. 6 Sätze 5 and 6 a.F. were ABOLISHED by JStG 2024

The statute now has five Sätze and S. 5 is the Bescheinigung rule. The former
S. 5 (Termingeschäfte, €20.000 annual offset cap) and S. 6 (wertlose
Kapitalforderungen) are gone. The BMF adds the transitional rule: losses booked
under S. 6 a.F. **move into the *sonstige* pot** (§20 Abs. 6 S. 1–3), for both
Kapitalertragsteuerabzug and already-assessed carryforwards.

**This changes `…-elster-multi-scenario-support.md` §3.3 / Plan 4.** That spec
treats Termingeschäfte losses as a separately ring-fenced bucket. The
*offset restriction* is abolished — but the *reporting lines* (KAP Zeilen 21/24)
still exist on the 2025 form and the help text still says losses go
*"ausschließlich in Zeile 24"*. Reporting obligation ≠ offset restriction; keep
them distinct when Plan 4 is built.

Also relevant to Zeile 25: **"Verluste aus dem wertlosen Verfall von Aktien sind
Verluste im Sinne des § 20 Absatz 6 Satz 4 EStG"** — a share becoming worthless
lands in the *Aktien* pot, so it CAN consume this carryforward, unlike a fund
loss.

## 8. Open questions

1. **Is the Sonstige bucket carried forward separately?** §20 Abs. 6 S. 4 rings
   only Aktien; other §20 losses offset more broadly. The `sonstigeEur` field is
   provisional pending confirmation of how it is separately assessed.
2. **Broker-level vs Veranlagung-level pots.** German brokers maintain their own
   Verlustverrechnungstöpfe; foreign brokers do not. Per the BMF,
   institutsübergreifende Verrechnung of Aktien losses requires a
   Steuerbescheinigung under §45a Abs. 2 from each institution. For a user with
   both German and foreign brokers this needs modelling. All the reference
   user's brokers are foreign, so it is not blocking today.

## 9. Non-goals

- Recommending *which* position to sell on investment grounds. The panel ranks
  by tax mechanics only; it must not imply a view on the security.
- Executing trades. Folio reads statements; it never places orders.
- Modelling Vorabpauschale interaction with the sale basis (§19 InvStG) — that
  is the deferred Vorabpauschale plan, and it concerns funds, which cannot
  consume this carryforward anyway.
