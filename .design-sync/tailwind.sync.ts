/*
 * Tailwind config used ONLY to compile a standalone stylesheet for design-sync.
 *
 * The app never produces a compiled CSS file — Next builds Tailwind at run
 * time — so the sync has to generate one. This reuses the real theme verbatim
 * (colors, fonts, plugins) and only widens `content` so that utility classes
 * used by authored preview files are emitted too. Without that, a preview
 * using a class no app file happens to use would render unstyled.
 */
import type { Config } from "tailwindcss";
import base from "../tailwind.config";

/*
 * Every colour token, as bg-/text-/border-/ring-.
 *
 * Tailwind only emits classes it SEES used. The app happens to use `bg-accent`
 * and `ring-ring` solely as `hover:`/`focus-visible:` variants, so the base
 * classes were never emitted — and the design agent building new screens does
 * not run this build, it can only use what ships in the compiled stylesheet.
 * A documented class that isn't in that file is a class that silently does
 * nothing.
 *
 * So the whole palette is safelisted: the vocabulary the conventions header
 * advertises is exactly the vocabulary that works.
 */
const COLORS = [
  "bg", "panel", "panel2", "border", "borderHard",
  "ink", "muted", "dim",
  "mint", "amber", "pink", "bad",
  "brand-ibkr", "brand-freedom", "brand-coinbase",
  "primary", "primary-foreground",
  "secondary", "secondary-foreground",
  "accent", "accent-foreground",
  "foreground", "muted-foreground", "ring",
];

const safelist = COLORS.flatMap((c) => [
  `bg-${c}`,
  `text-${c}`,
  `border-${c}`,
  `ring-${c}`,
  `hover:bg-${c}`,
  `hover:text-${c}`,
]);

export default {
  ...base,
  content: ["./src/**/*.{ts,tsx}", "./.design-sync/previews/**/*.tsx"],
  safelist,
} satisfies Config;
