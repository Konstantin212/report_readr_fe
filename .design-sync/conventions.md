# Folio — how to build with this design system

Folio is a **dark-only** interface for an investment-portfolio and German tax
app. Dense, numeric, quiet. There is no light theme — do not build one.

## Setup

No provider, no theme context, no wrapper component. Import a component and
render it. Styling comes entirely from `styles.css` (which pulls in the
component CSS and the Geist fonts) — link it once and everything works.

**Every screen must sit on the page background.** Nothing paints it for you:

```jsx
<div className="bg-bg text-ink min-h-screen p-6">
  {/* your screen */}
</div>
```

Skip that and components render on white, where 58%-opacity text and hairline
borders disappear.

## The styling idiom: Tailwind utilities with Folio's own palette

Use Tailwind utility classes. Use **these** colour names — they are the whole
vocabulary, and generic Tailwind colours (`bg-slate-800`, `text-gray-400`) are
off-brand:

| Purpose | Classes |
|---|---|
| Surfaces | `bg-bg` (page, #0b0d10) · `bg-panel` (card, #13171c) · `bg-panel2` (subtle/hover, #181d23) |
| Borders | `border-border` (white 6%) · `border-borderHard` (white 10%) |
| Text | `text-ink` (primary) · `text-muted` (58%) · `text-dim` (35%, tiny labels) |
| Meaning | `text-mint` / `bg-mint` (positive, gains) · `text-bad` (negative, losses) · `text-amber` (warning) · `text-pink` |
| Brand | `bg-brand-ibkr` · `bg-brand-freedom` · `bg-brand-coinbase` — only to *identify* a broker, never to mean good/bad |
| shadcn aliases | `bg-primary` (=mint) · `bg-secondary` / `bg-accent` (=panel2) · `text-foreground` (=ink) · `text-muted-foreground` (=muted) · `ring-ring` (=mint) |

Type is Geist Sans and Geist Mono:

- `font-mono` for **every number, ticker, currency code, and date**, plus
  uppercase eyebrow labels.
- `num` (a plain CSS class, not a Tailwind utility) turns on tabular numerals.
  **Put it on every figure** — columns of numbers must align.

## Two patterns that define the look

**The metric.** A tiny uppercase mono label above a large bold figure:

```jsx
<div className="font-mono text-[10px] uppercase tracking-widest text-dim">
  Portfolio value
</div>
<div className="font-bold text-[26px] mt-1.5 num text-ink">€48 210,55</div>
```

**Sign colour.** Gains are `text-mint`, losses `text-bad` — always, everywhere,
including inside tables and charts. Never red/green from another palette.

Cards are `rounded-[22px]` with `p-[22px]`; use the `Card` component rather
than rebuilding that.

## Where the truth lives

- `styles.css` and its imports — the compiled utilities and `@font-face` rules.
  Read it before inventing a class.
- `components/<group>/<Name>/<Name>.d.ts` — the real prop contract.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage.

## A typical composition

```jsx
<div className="bg-bg text-ink min-h-screen p-6 space-y-4">
  <KpiStrip
    items={[
      { label: "Portfolio value", value: "€48 210,55" },
      { label: "Unrealised P/L", value: "+€6 142,80", accent: "mint" },
      { label: "Realised 2025", value: "−€1 642,92", accent: "bad" },
    ]}
  />

  <Card>
    <div className="flex justify-between items-baseline mb-4">
      <div className="font-semibold text-base">Allocation</div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
        by sector
      </div>
    </div>
    <CurrencyBars data={[{ code: "EUR", pct: 62.4 }, { code: "USD", pct: 37.6 }]} />
  </Card>
</div>
```

Layout glue is yours to write with utilities; reach for a Folio component
whenever one exists for the job.
