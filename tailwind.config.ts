import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:       "#0b0d10",
        panel:    "#13171c",
        panel2:   "#181d23",
        border:   "rgba(255,255,255,0.06)",
        borderHard: "rgba(255,255,255,0.10)",
        ink:      "#ECEEF2",
        muted:    "rgba(236,238,242,0.58)",
        dim:      "rgba(236,238,242,0.35)",
        mint:     "var(--accent-mint, #7CFFB2)",
        amber:    "var(--accent-amber, #FFD24A)",
        pink:     "var(--accent-pink, #FF5DA2)",
        bad:      "#FF6F6F",
        // Broker brand colors. Used wherever we *identify* a broker
        // (chip pills, the tour selector). Kept separate from semantic
        // tokens like `mint` (positive numbers) and `bad` (loss/error)
        // so the brand doesn't read as "good" or "bad".
        brand: {
          ibkr:     "#B91C1C", // IBKR red diamond
          freedom:  "#2EA245", // Freedom Holding shield green
          coinbase: "#0052FF", // Coinbase blue
        },

        // shadcn semantic tokens, mapped onto the palette above.
        //
        // `ui/button.tsx` and `ui/table.tsx` came from shadcn, which expects
        // these names — but they were never added to the theme, so every one
        // of their `bg-primary` / `text-muted-foreground` / `ring-ring`
        // classes silently resolved to nothing. The submit button on the
        // import form has been rendering with no background as a result
        // (found 2026-07-20 while compiling this theme standalone for the
        // design-system sync, which was the first time anything checked).
        //
        // Mapped rather than invented: each one points at a colour already
        // in use, so the shadcn components inherit the existing look instead
        // of introducing a second palette.
        // Literal hex, not `var(--accent-mint, …)` like `mint` above:
        // Tailwind cannot apply an opacity modifier to a var() colour, and
        // button.tsx needs `hover:bg-primary/90`. The rendered colour is
        // identical — `--accent-mint` is referenced in several components but
        // never actually assigned anywhere, so it has always resolved to its
        // fallback.
        primary:              "#7CFFB2",                // = mint
        "primary-foreground": "#0b0d10",                // = bg, for contrast on mint
        secondary:            "#181d23",                // = panel2
        "secondary-foreground": "#ECEEF2",              // = ink
        accent:               "#181d23",                // = panel2 (hover surface)
        "accent-foreground":  "#ECEEF2",                // = ink
        foreground:           "#ECEEF2",                // = ink
        "muted-foreground":   "rgba(236,238,242,0.58)", // = muted
        ring:                 "#7CFFB2",                // = mint, focus ring
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter Tight", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [animate],
} satisfies Config;
