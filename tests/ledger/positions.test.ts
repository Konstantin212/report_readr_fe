import { describe, it, expect } from "vitest";
import { derivePositions } from "@/lib/ledger/positions";
import { replay } from "@/lib/ledger/replay";
import { FIXTURE } from "../fixtures/ledger/simple-portfolio";

describe("derivePositions", () => {
  it("sums remaining lots per symbol", () => {
    const { lots } = replay(FIXTURE);
    const positions = derivePositions(lots);
    expect(positions).toHaveLength(1);
    expect(Number(positions[0].quantity)).toBe(7); // 2 + 5
  });
});
