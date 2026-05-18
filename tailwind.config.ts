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
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter Tight", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [animate],
} satisfies Config;
