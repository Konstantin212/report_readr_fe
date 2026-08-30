# Crypto §22 / §23 module — the BMF authority behind `anlage-so.ts`

Status: **citation recorded 2026-08-29**, one item explicitly unverified (§3).

`CLAUDE.md` holds the tax module to a legal-correctness standard: every rate,
threshold and rule must be verifiable against the BMF law book or the official
ELSTER form. `docs/` already met that bar for the KAP loss buckets and the
Vorabpauschale Basiszins, but **nothing in `docs/` cited a BMF source for the
crypto §22 / §23 module** (`src/lib/tax/anlage-so.ts` and the crypto replay
path) until this doc existed. That gap was surfaced by the
[public-landing-page tax review](superpowers/specs/2026-08-29-public-landing-page-tax-review.md),
which had to retrieve the governing circular in order to review one sentence of
marketing copy.

This file records the citation itself. It is not a restatement of the rules and
it does not describe the implementation — it says **which primary text the
module answers to**, so the next person changing `anlage-so.ts` knows what to
check against instead of reaching for a secondary source.

## 1. The governing circular

**BMF-Schreiben v. 6. März 2025** — "Einzelfragen zur ertragsteuerrechtlichen
Behandlung bestimmter Kryptowerte", GZ **IV C 1 - S 2256/00042/064/043**, DOK
COO.7005.100.4.11527963, 34 pages. Retrieved from
`bundesfinanzministerium.de` on 2026-08-29 and text-extracted locally.

This supersedes the position the module would otherwise be resting on
implicitly. It is the authority for everything in §2.

## 2. Operative Randnummern, and what each one governs

| Rn. | Holding | Governs |
|---|---|---|
| **45** | Block-creation income not attributable to another income type is a Leistung under § 22 Nr. 3 EStG, and is tax-free only if it stays under €256 **"zusammen mit anderen Einkünften aus Leistungen"** | The §22 Freigrenze in `anlage-so.ts`. The qualifier matters: the €256 is *not* a per-app threshold — it is measured across all of the taxpayer's Leistungen, which the app cannot see. Any figure the app shows against it is partial by construction. |
| **48** | Passive staking (staking pool, platform staking) is "der privaten Vermögensverwaltung unterfallende Fruchtziehung" and is taxed under § 22 Nr. 3 EStG | Why staking rewards route to §22 rather than §23 or §20. |
| **55** | "Die Veräußerungsfristen des § 23 Absatz 1 Satz 1 Nummer 2 EStG beginnen nach jedem Tausch neu"; the Jahresfrist is determined from platform-recorded or wallet timestamps | The holding-period computation in the crypto replay. Note it is a **Jahresfrist**, not a 365-day count — see §3. |
| **61** | "Es gilt der Grundsatz der **Einzelbetrachtung**." First-acquired-first-sold applies only where individual identification is impossible, with the **Durchschnittsmethode** for valuation. FIFO for valuation is expressly a simplification ("Aus Vereinfachungsgründen kann … unterstellt werden"), it is **wallet-scoped** ("Es gilt eine walletbezogene Betrachtung"), and the chosen method must be kept until that wallet's holding of that Handelsbezeichnung is fully sold | The cost-basis method. The module's FIFO is a permitted simplification, not the statutory default — describing it as "the rule" anywhere, in code comments or in user-facing copy, overstates it. |
| **63** | "Bei Currency oder Payment Token … kommt die Verlängerung der Veräußerungsfrist nach § 23 Absatz 1 Satz 1 Nummer 2 Satz 4 EStG nicht zur Anwendung." | Confirms the module's one-year assumption is safe for currency/payment tokens: the ten-year extension does not bite for staked or lent units. |

Statutory text the circular sits on, verbatim from gesetze-im-internet.de
(BMJ official consolidated text, retrieved 2026-08-29):

- **§ 22 Nr. 3 Satz 2 EStG** — "Solche Einkünfte sind nicht
  einkommensteuerpflichtig, wenn sie weniger als 256 Euro im Kalenderjahr
  betragen haben."
- **§ 23 Abs. 1 Satz 1 Nr. 2 Satz 1 EStG** — "…bei denen der Zeitraum zwischen
  Anschaffung und Veräußerung nicht mehr als ein Jahr beträgt."
- **§ 23 Abs. 3 Satz 5 EStG** — "Gewinne bleiben steuerfrei, wenn der aus den
  privaten Veräußerungsgeschäften erzielte Gesamtgewinn im Kalenderjahr weniger
  als 1 000 Euro betragen hat."
- **§ 23 Abs. 3 Satz 7 EStG** — §23 losses offset only §23 gains of the same
  calendar year and may not be deducted under § 10d.

## 3. Flagged, not confirmed

**The effective date of the §23 600 → 1 000 uplift encoded at
`src/lib/tax/anlage-so.ts:33-35` is unverified.** The current consolidated
statute reads €1 000 and § 52 EStG carries no transitional rule for § 23 Abs. 3
Satz 5, but the reviewer did **not** retrieve the amending act, so the
pre-2024 €600 branch is unconfirmed. Treat it as flagged: it has not been
approved by a source review, and the next change touching that constant should
close it by retrieving the amending act rather than by inheriting this note.

A second wording point from Rn. 55, recorded so it is not re-litigated: the
statute fixes a **Jahresfrist** ("nicht mehr als ein Jahr"), not a 365-day
count. The two diverge across a leap day. Any place in the code or the copy
that expresses the holding period as a day count is an approximation of the
statutory rule, not a restatement of it.
