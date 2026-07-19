/**
 * The captions shown in the PDF and the values card must come from the
 * registry, not from local copies. Three copies previously existed and could
 * drift; one of them shipped a caption pointing at the wrong form section.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { labelFor, fieldFor } from "@/lib/tax/elster-fields";

const FILES = [
  "src/lib/tax/export-pdf.tsx",
  "src/components/pulse/elster-values-card.tsx",
];

describe("caption single-sourcing", () => {
  it("no consumer defines its own KAP_LABELS map", () => {
    for (const f of FILES) {
      expect(readFileSync(f, "utf8")).not.toContain("const KAP_LABELS");
    }
  });

  it("labelFor renders Zeile number and caption together", () => {
    expect(labelFor("KAP_Z41")).toBe(
      "Z41 — Anrechenbare noch nicht angerechnete ausländische Steuern",
    );
  });

  it("exposes precision so the export can stop saying 'whole euros' everywhere", () => {
    expect(fieldFor("KAP_Z19").precision).toBe("whole_euro");
    expect(fieldFor("KAP_Z37").precision).toBe("euro_cent");
  });
});
