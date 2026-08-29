import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BROKER_INSTRUCTIONS,
  BROKER_SUMMARIES,
  UPLOAD_INSTRUCTION_SECTIONS,
  coinbasePasteInstruction,
  spansToText,
  type InstructionBrokerId,
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

describe("AC-SEO6.3: the landing page's orientation summaries derive from the instructions", () => {
  // The public landing page renders BROKER_SUMMARIES instead of retyping a
  // broker menu path (SEO issue #2, design ss7.1). A stale summary there is a
  // wrong instruction Google serves, so the derivation is asserted on the
  // imported values rather than fenced by phrase: every word the summary shows
  // has to be a word the full instructions already say.
  it("covers exactly the brokers the instruction module owns", () => {
    expect([...BROKER_SUMMARIES].map((s) => s.id).sort()).toEqual(
      Object.keys(BROKER_INSTRUCTIONS).sort(),
    );
  });

  // Leading menu segments a summary is allowed to drop, per broker, each with
  // the reason it is safe to drop. Anything arrow-joined ahead of a summary's
  // first segment that is NOT declared here fails the front-door test below.
  // That is the half the "appears verbatim" case cannot cover on its own: a
  // summary can quote real segments and still start the reader inside a
  // product they were never told to open (review finding B1,
  // docs/superpowers/specs/2026-08-29-public-landing-page-review.md).
  const ELIDED_PATH_LEAD: Record<InstructionBrokerId, readonly string[]> = {
    // Client Portal is IBKR's only web UI, so it is where a reader told
    // "Interactive Brokers" already is. Naming it adds no orientation.
    ibkr: ["Client Portal"],
    // The summary's own label says Freedom24, and "top right" is a screen
    // position rather than a destination anyone can look up.
    freedom: ["Freedom24", "top right"],
    // Nothing may be dropped: the Developer Platform is a separate product
    // from the Coinbase retail app that "Coinbase" sends a reader to, so the
    // summary has to name it (review finding B1).
    coinbase: [],
  };

  for (const summary of BROKER_SUMMARIES) {
    const text = sectionText(BROKER_INSTRUCTIONS[summary.id]);

    it(`${summary.id}: every path segment appears verbatim in the full instructions`, () => {
      expect(summary.path.length).toBeGreaterThan(0);
      // Verbatim AND in the instructions' own order — scanning forward from the
      // previous match means a reversed pair can no longer stay green (N1).
      let cursor = 0;
      for (const segment of summary.path) {
        expect(text).toContain(segment);
        const at = text.indexOf(segment, cursor);
        expect(at, `"${segment}" does not appear after the segment before it`).toBeGreaterThanOrEqual(0);
        cursor = at + segment.length;
      }
    });

    it(`${summary.id}: path is the whole menu chain from the broker's front door`, () => {
      const chain = [...ELIDED_PATH_LEAD[summary.id], ...summary.path].join(" → ");
      const at = text.indexOf(chain);
      // Contiguity + order: the segments are arrow-joined in the instructions
      // in exactly this sequence, not merely present somewhere in the section.
      expect(at, `menu chain "${chain}" is not contiguous in:\n${text}`).toBeGreaterThanOrEqual(0);
      // Completeness: nothing arrow-joined may precede the chain. An undeclared
      // segment ahead of it is a step the reader has to guess (finding B1).
      expect(
        text.slice(0, at),
        `"${summary.path[0]}" has an undeclared menu segment ahead of it`,
      ).not.toMatch(/→\s*$/);
    });

    it(`${summary.id}: every artifact term appears verbatim in the full instructions`, () => {
      expect(summary.artifact.length).toBeGreaterThan(0);
      for (const term of summary.artifact) {
        expect(text).toContain(term);
      }
    });
  }

  it("stays an orientation line: no sentences, no steps, no warnings", () => {
    for (const summary of BROKER_SUMMARIES) {
      for (const label of [...summary.path, ...summary.artifact]) {
        expect(label).not.toMatch(/[.!?]$/);
      }
    }
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
