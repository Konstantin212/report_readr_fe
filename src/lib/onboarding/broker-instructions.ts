/**
 * The single authoring site for every broker export / connect instruction the
 * app shows (AC-OC0.2). Three surfaces render this module — the welcome tour,
 * the `/upload` disclosure and the Settings → Crypto empty state — so the
 * prose cannot drift between them again.
 *
 * Deliberately plain TypeScript: no JSX, no React import, no Tailwind class
 * names. Chrome belongs to the consumer (AC-OC2.8), and keeping the copy in a
 * `.ts` module is what lets this repo's node-environment Vitest assert on the
 * shipped words directly instead of scraping component source.
 */

/** Broker whose export/connect instructions this module owns. */
export type InstructionBrokerId = "ibkr" | "freedom" | "coinbase";

/**
 * One run of instruction text. A bare string is plain prose; the object forms
 * carry emphasis that every surface must render the same way. `em: "code"` is
 * the monospace chip used for filenames and extensions.
 */
export type CopySpan =
  | string
  | { t: string; em: "strong" }
  | { t: string; em: "code" }
  | { t: string; em: "link"; href: `https://${string}` | `/${string}` };

export type InstructionSection = {
  id: InstructionBrokerId;
  /** Short brand label rendered in a badge, e.g. "IBKR". */
  badge: string;
  /** Section heading, e.g. "Get your IBKR Activity Statement". */
  title: string;
  /** Optional lead paragraph above the numbered steps. */
  lead?: CopySpan[];
  /** The numbered steps, in order. */
  steps: CopySpan[][];
  /** Body paragraphs after the steps. */
  notes: CopySpan[][];
  /** De-emphasised trailing footnote (warning / rationale). */
  footnote?: CopySpan[];
};

const strong = (t: string): CopySpan => ({ t, em: "strong" });
const code = (t: string): CopySpan => ({ t, em: "code" });

/**
 * AC-OC1.2/1.3/1.8 — the single authoring site for "open the downloaded .json
 * and paste all of it". `where` swaps ONLY the pointer to the target field, so
 * the tour and the Settings → Crypto empty state can never disagree on the
 * substance. "CDP Key JSON" is the literal label of the one textarea on
 * `crypto-accounts-manager.tsx`, so AC-OC1.3's "named exactly" is verifiable.
 */
export function coinbasePasteInstruction(
  where: "on-settings-crypto-page" | "elsewhere",
): CopySpan[] {
  return [
    "Open the downloaded ",
    code(".json"),
    " file in a text editor (Notepad, TextEdit — any editor), copy its ",
    strong("entire contents"),
    ", and paste all of it into the single ",
    strong("CDP Key JSON"),
    " box",
    where === "elsewhere" ? " on Settings → Crypto." : " above.",
  ];
}

/** The single authoring site for all three brokers' instruction prose. */
export const BROKER_INSTRUCTIONS: Record<InstructionBrokerId, InstructionSection> = {
  ibkr: {
    id: "ibkr",
    badge: "IBKR",
    title: "Get your IBKR Activity Statement",
    steps: [
      [strong("Client Portal"), " → ", strong("Performance & Reports"), " → ", strong("Statements"), "."],
      [strong("Activity Statement"), " → period ", strong("Annual"), " (one per tax year)."],
      ["Format ", strong("CSV"), ", sections ", strong("all"), " (the default)."],
      ["Click ", strong("Run"), ", then ", strong("Download"), "."],
    ],
    notes: [["Repeat for each year you need."]],
    footnote: [
      "Heads up: don't use the ",
      strong("Flex Query"),
      " CSV — column names differ. Use the standard Activity Statement.",
    ],
  },
  freedom: {
    id: "freedom",
    badge: "FREEDOM24",
    title: "Get your Freedom24 statement",
    steps: [
      ["Open ", strong("Freedom24"), " → top right → ", strong("Statements"), "."],
      ["Set the period to ", strong("All time"), " (or the earliest year you want taxes for)."],
      ["Choose ", strong("JSON"), " as the format."],
      ["Click ", strong("Download"), "."],
    ],
    notes: [
      [
        "You'll get a file like ",
        code("2017xx_…_all.json"),
        ". Keep it on disk — you'll drop it on the upload page.",
      ],
    ],
    footnote: [
      "Why JSON? It has the full trade / dividend / WHT history with ISINs and FX. CSV exports drop fields the tax draft needs.",
    ],
  },
  coinbase: {
    id: "coinbase",
    badge: "COINBASE",
    title: "Connect Coinbase via API key",
    lead: ["Crypto syncs live, not via file upload. You'll create a ", strong("read-only"), " CDP API key:"],
    steps: [
      [
        strong("Coinbase Developer Platform"),
        " → ",
        strong("Portfolios"),
        " → ",
        strong("API keys"),
        " → ",
        strong("Create"),
        ".",
      ],
      ["Permissions: ", strong("view only"), " (do not enable trade or send)."],
      [
        "When the key is created, Coinbase downloads a ",
        code(".json"),
        " ",
        strong("file"),
        " — that file is the only thing you need.",
      ],
      coinbasePasteInstruction("elsewhere"),
    ],
    notes: [
      [
        "A daily sync then pulls trades, staking rewards and balances into ",
        strong("§22"),
        " (staking income) and ",
        strong("§23"),
        " (private sale) automatically.",
      ],
    ],
  },
};

/**
 * One-line orientation summary per broker, for the public landing page.
 *
 * NOT instructions — no steps, no warnings, no walkthrough. The landing page
 * tells a visitor which menu to look for before they have an account; the
 * real walkthrough lives in `BROKER_INSTRUCTIONS` and is what they follow
 * once they are in.
 *
 * Every string in `path` and `artifact` must also appear verbatim in that
 * broker's own `InstructionSection`. That is asserted over these values in
 * `tests/onboarding/broker-instructions.test.ts`, not fenced by phrase, so
 * that a rename inside the full instructions cannot leave a wrong menu path
 * behind on a page Google serves.
 */
export type BrokerSummary = {
  id: InstructionBrokerId;
  /** Display name, e.g. "Interactive Brokers". */
  label: string;
  /** Menu path, in the broker's own words, rendered joined by an arrow. */
  path: readonly string[];
  /** What you end up with, rendered emphasised. */
  artifact: readonly string[];
  /** Free qualifier, e.g. "optional". Not fenced against the section. */
  note?: string;
};

export const BROKER_SUMMARIES: readonly BrokerSummary[] = [
  {
    id: "ibkr",
    label: "Interactive Brokers",
    path: ["Performance & Reports", "Statements"],
    artifact: ["Activity Statement", "Annual", "CSV"],
  },
  {
    id: "freedom",
    label: "Freedom24",
    path: ["Statements"],
    artifact: ["All time", "JSON"],
  },
  {
    id: "coinbase",
    label: "Coinbase",
    path: ["Coinbase Developer Platform", "Portfolios", "API keys"],
    artifact: ["view only"],
    note: "optional",
  },
];

/**
 * Sections the `/upload` disclosure shows, in order. Statement-upload brokers
 * only — Coinbase is a live API sync, not a file upload. This explicit list is
 * also why the disclosure cannot grow an unintended broker section (AC-OC2.9).
 */
export const UPLOAD_INSTRUCTION_SECTIONS: readonly InstructionSection[] = [
  BROKER_INSTRUCTIONS.ibkr,
  BROKER_INSTRUCTIONS.freedom,
];

/** Flattens spans to plain text. Used by tests and by `title`/`aria-label`. */
export function spansToText(spans: CopySpan[]): string {
  return spans.map((s) => (typeof s === "string" ? s : s.t)).join("");
}
