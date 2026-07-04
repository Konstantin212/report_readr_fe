import { describe, it, expect } from "vitest";
import {
  sortByName,
  summarizeQueue,
  isTerminal,
  type FileStatus,
} from "@/components/pulse/upload-queue";

// The helpers only touch `file.name`, so plain stubs stand in for File.
function item(name: string, status: FileStatus = "pending", extra: Partial<{ insertedCount: number; duplicateCount: number }> = {}) {
  return { id: name, file: { name } as File, status, ...extra };
}

describe("sortByName", () => {
  it("orders a mixed FF/IBKR batch by filename ascending", () => {
    const batch = [item("ibkr-2024.csv"), item("ff-2023.json"), item("ff-2024.json")];
    expect(sortByName(batch).map(i => i.file.name)).toEqual([
      "ff-2023.json",
      "ff-2024.json",
      "ibkr-2024.csv",
    ]);
  });

  it("is deterministic and does not mutate the input", () => {
    const batch = [item("b.csv"), item("a.json")];
    const sorted = sortByName(batch);
    expect(sorted.map(i => i.file.name)).toEqual(["a.json", "b.csv"]);
    expect(batch.map(i => i.file.name)).toEqual(["b.csv", "a.json"]);
  });
});

describe("isTerminal", () => {
  it("treats done / skipped-duplicate / failed as terminal", () => {
    expect(isTerminal("done")).toBe(true);
    expect(isTerminal("skipped-duplicate")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
  });
  it("treats pending / parsing / uploading as non-terminal", () => {
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("parsing")).toBe(false);
    expect(isTerminal("uploading")).toBe(false);
  });
});

describe("summarizeQueue", () => {
  it("counts processed only for terminal items and sums event counts", () => {
    const s = summarizeQueue([
      item("a", "done", { insertedCount: 10, duplicateCount: 2 }),
      item("b", "skipped-duplicate", { insertedCount: 0, duplicateCount: 5 }),
      item("c", "failed"),
      item("d", "parsing"),
      item("e", "pending"),
    ]);
    expect(s.total).toBe(5);
    expect(s.processed).toBe(3);
    expect(s.done).toBe(1);
    expect(s.skippedDuplicate).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.totalInserted).toBe(10);
    expect(s.totalDuplicates).toBe(7);
  });

  it("reports a fully-pending batch as unprocessed", () => {
    const s = summarizeQueue([item("a"), item("b")]);
    expect(s.processed).toBe(0);
    expect(s.total).toBe(2);
  });
});
