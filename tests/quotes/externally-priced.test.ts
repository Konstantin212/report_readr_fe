/**
 * IEMM (iShares MSCI EM UCITS, IE00B0M63177) must NOT be suppressed from the
 * refresh cron. It was excluded on the stale premise that Yahoo blocks the
 * Vercel egress IP; from fra1 justETF prices it by ISIN (EUR), so excluding it
 * only froze it on a broker snapshot. This guards against re-adding it.
 */
import { describe, it, expect } from "vitest";
import { EXTERNALLY_PRICED_SYMBOLS } from "@/lib/quotes/externally-priced";

describe("EXTERNALLY_PRICED_SYMBOLS", () => {
  it("does not suppress IEMM (it prices via justETF now)", () => {
    expect(EXTERNALLY_PRICED_SYMBOLS.has("IEMM")).toBe(false);
  });
});
