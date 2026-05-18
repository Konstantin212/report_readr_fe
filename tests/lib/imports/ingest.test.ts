import { describe, it, expect } from "vitest";
import { ingestParsedImport } from "@/lib/imports/ingest";

describe("ingestParsedImport", () => {
  it("rejects payload that fails zod validation", async () => {
    await expect(ingestParsedImport("u1", { broker: "INTERACTIVE_BROKERS" } as never)).rejects.toThrow(/INVALID_PAYLOAD/);
  });
});
