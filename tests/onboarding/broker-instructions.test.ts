import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BROKER_INSTRUCTIONS,
  UPLOAD_INSTRUCTION_SECTIONS,
  coinbasePasteInstruction,
  spansToText,
  type InstructionSection,
} from "@/lib/onboarding/broker-instructions";

/**
 * The instruction prose is a plain `.ts` data module precisely so its words
 * can be asserted directly instead of scraped out of a `.tsx` source file
 * (this repo runs Vitest in `environment: "node"` with no jsdom — see
 * `tests/auth/copy.test.ts` for the full rationale). Everything below is a
 * real assertion on the shipped copy, not a proxy for one.
 */
const repoRoot = path.resolve(__dirname, "../..");

function sectionText(section: InstructionSection): string {
  return [
    section.title,
    ...(section.lead ? [spansToText(section.lead)] : []),
    ...section.steps.map(spansToText),
    ...section.notes.map(spansToText),
    ...(section.footnote ? [spansToText(section.footnote)] : []),
  ].join("\n");
}

describe("AC-OC2.4/2.5: IBKR export instructions", () => {
  const ibkr = BROKER_INSTRUCTIONS.ibkr;
  const text = sectionText(ibkr);

  it("keeps the four steps the tour shows today", () => {
    expect(ibkr.steps).toHaveLength(4);
    for (const phrase of [
      "Client Portal",
      "Performance & Reports",
      "Statements",
      "Activity Statement",
      "Annual",
      "CSV",
      "all",
      "Run",
      "Download",
    ]) {
      expect(text).toContain(phrase);
    }
  });

  it("keeps the 'repeat for each year' note", () => {
    expect(ibkr.notes.map(spansToText).join("\n")).toContain("Repeat for each year");
  });

  it("keeps the Flex Query warning as the de-emphasised footnote (AC-OC2.5)", () => {
    expect(ibkr.footnote).toBeDefined();
    const footnote = spansToText(ibkr.footnote!);
    expect(footnote).toContain("Flex Query");
    expect(footnote).toContain("Activity Statement");
  });
});

describe("AC-OC2.6: Freedom24 export instructions", () => {
  const freedom = BROKER_INSTRUCTIONS.freedom;
  const text = sectionText(freedom);

  it("keeps the four steps the tour shows today", () => {
    expect(freedom.steps).toHaveLength(4);
    for (const phrase of ["Freedom24", "Statements", "All time", "JSON", "Download"]) {
      expect(text).toContain(phrase);
    }
  });

  it("keeps the example filename and the 'why JSON' note", () => {
    expect(freedom.notes.map(spansToText).join("\n")).toContain("2017xx_…_all.json");
    expect(freedom.footnote).toBeDefined();
    expect(spansToText(freedom.footnote!)).toContain("CSV exports drop fields");
  });
});

describe("AC-OC1.1–1.4: Coinbase instructions describe the real single-textarea form", () => {
  const coinbase = BROKER_INSTRUCTIONS.coinbase;
  const text = sectionText(coinbase);

  it("names the downloaded .json file as the only artefact (AC-OC1.1)", () => {
    expect(text).toContain(".json");
    expect(text).toContain("downloads");
  });

  it("tells the user to open it in a text editor and copy its entire contents (AC-OC1.2)", () => {
    expect(text).toContain("text editor");
    expect(text).toContain("entire contents");
  });

  it("names the single target field exactly as the form labels it (AC-OC1.3)", () => {
    expect(text).toContain("CDP Key JSON");
  });

  it("preserves the read-only permission guidance (AC-OC1.4)", () => {
    for (const phrase of ["Coinbase Developer Platform", "Portfolios", "API keys", "Create", "view only"]) {
      expect(text).toContain(phrase);
    }
  });

  it("no longer tells the user to copy a key + secret pair (AC-OC1.3)", () => {
    expect(text).not.toMatch(/Copy the key \+ secret|Paste them/);
  });
});

describe("AC-OC1.8: the paste sentence has exactly one authoring site", () => {
  const elsewhere = coinbasePasteInstruction("elsewhere");
  const onPage = coinbasePasteInstruction("on-settings-crypto-page");

  it("says the same substantive thing on both surfaces", () => {
    for (const spans of [elsewhere, onPage]) {
      const text = spansToText(spans);
      expect(text).toContain("entire contents");
      expect(text).toContain("CDP Key JSON");
      expect(text).toContain("text editor");
    }
  });

  it("differs only in the trailing clause that points at the field", () => {
    expect(spansToText(elsewhere.slice(0, -1))).toBe(spansToText(onPage.slice(0, -1)));
    expect(spansToText(elsewhere).endsWith("on Settings → Crypto.")).toBe(true);
    expect(spansToText(onPage).endsWith("above.")).toBe(true);
  });
});

describe("AC-OC2.9: the /upload disclosure covers statement brokers only", () => {
  it("lists IBKR then Freedom24 and nothing else", () => {
    expect(UPLOAD_INSTRUCTION_SECTIONS.map((s) => s.id)).toEqual(["ibkr", "freedom"]);
  });

  it("never mentions Revolut", () => {
    const text = UPLOAD_INSTRUCTION_SECTIONS.map(sectionText).join("\n");
    expect(text).not.toMatch(/revolut/i);
  });

  it("does not include Coinbase, which is an API sync rather than a file upload", () => {
    expect(UPLOAD_INSTRUCTION_SECTIONS.map((s) => s.id)).not.toContain("coinbase");
  });
});

describe("spansToText", () => {
  it("flattens plain, emphasised, code and link spans to their text", () => {
    expect(
      spansToText([
        "a ",
        { t: "b", em: "strong" },
        " c ",
        { t: "d", em: "code" },
        " e ",
        { t: "f", em: "link", href: "https://example.com/" },
      ]),
    ).toBe("a b c d e f");
  });
});

describe("AC-OC0.1: the Coinbase copy describes the form that actually exists", () => {
  const manager = readFileSync(
    path.join(repoRoot, "src/components/pulse/crypto-accounts-manager.tsx"),
    "utf8",
  );

  it("names the one field the connect form really renders", () => {
    // AC-OC0.1 is "same number of inputs, same label". Both halves are
    // checkable: the form has exactly one <textarea>, and its label text is
    // the literal the instructions tell the user to look for.
    expect(manager.match(/<textarea/g)).toHaveLength(1);
    const label = manager.match(/tracking-widest mb-1">([^<]+)<\/div>/)?.[1];
    expect(label).toBe("CDP Key JSON");
    expect(spansToText(coinbasePasteInstruction("elsewhere"))).toContain(label!);
  });

  it("calls that field 'single', consistent with there being one input", () => {
    expect(spansToText(coinbasePasteInstruction("elsewhere"))).toContain("single");
  });
});

describe("AC-OC2.8: the tour and the /upload disclosure render the same objects", () => {
  it("shares section identity, not just equal-looking prose", () => {
    // Reference equality is the strongest available proof that the wording
    // cannot drift: `welcome-tour.tsx` reads BROKER_INSTRUCTIONS.ibkr /
    // .freedom, and the disclosure maps UPLOAD_INSTRUCTION_SECTIONS.
    expect(UPLOAD_INSTRUCTION_SECTIONS[0]).toBe(BROKER_INSTRUCTIONS.ibkr);
    expect(UPLOAD_INSTRUCTION_SECTIONS[1]).toBe(BROKER_INSTRUCTIONS.freedom);
  });

  it("carries no layout or styling in the copy module (chrome belongs to consumers)", () => {
    const source = readFileSync(path.join(repoRoot, "src/lib/onboarding/broker-instructions.ts"), "utf8");
    expect(source).not.toMatch(/className|text-\[|bg-panel|<[a-z]+>/);
  });
});
