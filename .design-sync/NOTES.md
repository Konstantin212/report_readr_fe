# design-sync notes — Folio

Repo-specific gotchas for future syncs. Read this before re-running anything.

## What this repo is (and isn't)

Folio is a **Next.js application**, not a component library. `package.json` is
`private: true` with no `main`/`module`/`exports`, there is no `dist/`, and
`next build` emits an app, not a bundle. Everything below exists to bridge that
gap. The sync is deliberately scoped to the presentational slice — see
`.design-sync/entry.tsx` for the list and the exclusions, each with its reason.

## Toolchain

- **pnpm is the package manager** (`packageManager: pnpm@9.15.0`, `pnpm-lock.yaml`).
  A stale `yarn.lock` from May 2025 is also present — **ignore it**; `npm i`
  fails outright here (`Cannot read properties of null (reading 'matches')`).
- It is a **pnpm workspace** (`pnpm-workspace.yaml`, packages: `['.']`), so
  root installs need `-w`: `pnpm add -D -w <pkg>`.
- Playwright resolves to **1.60.0** (not the `^1.49.0` in package.json), which
  pins **chromium-1223**. `.ds-sync/` needs its own matching `playwright@1.60.0`
  — the repo only has `@playwright/test`, which the validator can't import.

## The three things that make this repo build

1. **Explicit entry** (`--entry ./.design-sync/entry.tsx`). Without it the
   converter synthesizes an entry with `export * from` every file under `src/`,
   which drags the data loaders — and `getDb` — into a browser bundle.
2. **`buildCmd` compiles Tailwind standalone.** Next compiles Tailwind at run
   time, so no stylesheet exists on disk to point `cssEntry` at. The command
   compiles `src/app/globals.css` through `.design-sync/tailwind.sync.ts` (which
   reuses the real theme but widens `content` to include the preview files, so
   classes used only in previews still get emitted) and then appends
   `.design-sync/preview-extras.css`.
3. **`preview-extras.css` defines `--font-geist-*`.** In the app `next/font`
   sets these. Outside Next they are undefined, and because
   `tailwind.config.ts` declares `fontFamily.sans` as
   `["var(--font-geist-sans)", …]`, preflight emits an invalid `font-family`
   declaration and **every preview falls back to browser-default serif**. The
   variables cannot live in `.design-sync/fonts.css` — the converter copies
   only `@font-face` rules out of an `extraFonts` stylesheet and drops the rest.

## Previews must supply their own background

The preview harness writes `body{background:#fff}` in an inline `<style>` that
comes AFTER the stylesheet links, so it beats the app's
`body{background:#0b0d10}`. Folio is dark-only: on white, `text-muted` (58%
ink), ghost buttons and hairline borders are invisible.

**Every authored preview wraps its cells in `<Frame>`**
(`.design-sync/previews/_frame.tsx`), which paints `bg-bg text-ink p-6`. This
is not optional — it is the difference between a truthful card and one that
teaches the design agent the wrong look.

## Responsive components need a viewport override

Preview cards are ~640px, below Tailwind's `lg:` breakpoint. Components with a
`lg:`-gated desktop layout (DataTable, and any grid-based component) render
their MOBILE fallback unless given
`cfg.overrides.<Name>: {"cardMode": "column", "viewport": "1280x720"}`.
Changing an override requires a full `package-build.mjs` — `preview-rebuild.mjs`
refuses with `[CONFIG_STALE]` because the grade keys are stamped at build time.

## App bugs this sync uncovered (fixed 2026-07-20)

Compiling Tailwind standalone was the first time anything checked whether the
classes in `src/components/ui/` actually resolve. They did not:

- `ui/button.tsx` used shadcn semantic tokens — `bg-primary`,
  `text-primary-foreground`, `bg-accent`, `ring-ring`, `text-foreground` —
  that were **never added to `tailwind.config.ts`**. The submit button on the
  import form (`imports/import-form.tsx:75`) had been rendering with no
  background. Fixed by mapping those names onto the existing palette.
- `primary`/`ring` are literal hex, not `var(--accent-mint, …)` like `mint`:
  Tailwind cannot apply an opacity modifier to a `var()` colour, and
  button.tsx needs `hover:bg-primary/90`. Same rendered colour —
  `--accent-mint` is referenced in several components but **never assigned
  anywhere**, so it has always resolved to its fallback.
- `ui/table.tsx` used `bg-muted` for row hover. In this theme `muted` is a
  TEXT colour (58% ink), so that would paint a near-white row on dark. Changed
  to `bg-panel2`, the palette's real subtle-surface token.

## Authoring previews: two traps that cost a full fan-out wave

**1. recharts animates for ~1.8s and the capture races it.**
`package-capture.mjs`'s `settle()` waits only for `document.fonts.ready` and
image decode. Every recharts primitive (Pie, Area, Line, Bar) enter-animates
via react-smooth on real `requestAnimationFrame` timestamps, which
`page.clock.setFixedTime()` does NOT freeze — so the screenshot fires mid-draw:
donuts come out as a flat sliver, area/line paths partial or empty.

The chart previews work around it per-file with a `useHoldNetworkBusy()` hook
that keeps the network non-idle for ~1.9s, pushing Playwright's `networkidle`
wait past the animation. **Keep that hook when editing those files** — removing
it silently reintroduces half-drawn charts that still "render", so the render
check passes and only a human notices.

**2. `preview-rebuild.mjs` does NOT re-run the Tailwind build.**
It recompiles preview JS against the CSS snapshot already in `ds-bundle/`. Any
utility class not already emitted — because no file under `src/**` used it at
the time `buildCmd` last ran — has **no CSS rule at all**, silently. For chart
wrappers that means `ResponsiveContainer` collapses to zero height with no
error and a blank card.

Two consequences:
- **Chart previews size their wrappers with inline `style={{height, width}}`**,
  never `h-`/`w-` utilities. Deliberate; don't "tidy" it into Tailwind.
- **Re-run `buildCmd` before `package-build.mjs`** whenever preview files gained
  new utility classes. `tailwind.sync.ts` already includes
  `.design-sync/previews/**` in `content`, but only an actual `buildCmd` run
  regenerates the stylesheet.

## Component bugs found but NOT fixed

- **`PerfChart` with `style="area"` never renders its `benchmark` line.**
  `src/components/pulse/perf-chart.tsx`'s area branch puts `<Line dataKey="b">`
  inside recharts' plain `<AreaChart>`, which silently drops non-Area children;
  it needs `<ComposedChart>`. Left alone as out of scope — the preview
  sidesteps it by demonstrating the benchmark with `style="line"`, where both
  series are the same element type. Worth fixing in the app.

## Known render warns (triaged, expect these)

- `[FONT_MISSING] "Inter Tight", "JetBrains Mono"` — these are second-position
  **fallbacks** in `tailwind.config.ts`'s font stacks. The primary families
  (Geist Sans/Mono) DO ship as `@font-face`, so the fallbacks never render.
  Not a substitute situation; no action needed.

## Re-sync risks

- **`.design-sync/.cache/tailwind.css` is gitignored** and regenerated by
  `buildCmd`. A fresh clone MUST run `buildCmd` before the converter or
  `cssEntry` points at nothing.
- **The Geist woff2 files are committed** under `.design-sync/fonts/` (SIL OFL
  1.1, `GEIST-LICENSE.txt` alongside). They were copied out of the `geist` npm
  package; if that dependency is dropped the fonts still ship, but the license
  file must stay with them.
- **`entry.tsx` is hand-maintained.** A new presentational component is NOT
  picked up automatically — it needs an export there AND a `componentSrcMap`
  pin. Conversely, if a listed component later grows a `next/navigation` or
  data-loader import, the bundle breaks for EVERY component (see Pagination).
- **`Pagination`, `BottomNav`, `BrokerFilter` are excluded** for router
  coupling. `Pagination`'s `next/link` import pulled Next internals whose
  `process.env.__NEXT_*` reads threw `process is not defined` and took down
  the whole IIFE — all 16 components, not just that one. If a future refactor
  gives them an `as`/render-prop escape hatch, they become syncable.
- **`guidelinesGlob` is pinned** to `.design-sync/guidelines/**/*.md`. The
  default (`docs/*.md`) swept this repo's German tax research into the design
  system, which is irrelevant to a design agent.
