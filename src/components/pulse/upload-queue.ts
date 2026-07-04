// Pure, UI-free helpers for the multi-file upload queue. Kept out of the
// React component so the ordering/summary logic can be unit-tested under the
// node-env vitest setup (no jsdom, so the component itself is not tested).

export type FileStatus =
  | "pending"
  | "parsing"
  | "uploading"
  | "done"
  | "skipped-duplicate"
  | "failed";

/** Statuses at which a file is finished being processed (success or not). */
export const TERMINAL_STATUSES: readonly FileStatus[] = [
  "done",
  "skipped-duplicate",
  "failed",
];

export type QueueItem = {
  /** Stable, batch-local id — NOT the server importId. */
  id: string;
  file: File;
  status: FileStatus;
  /** Present on "failed". */
  error?: string;
  /** From the ingest response, present on "done"/"skipped-duplicate". */
  insertedCount?: number;
  duplicateCount?: number;
};

export function isTerminal(status: FileStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Deterministic processing order: filename ascending (code-unit order, so it
 * is reproducible regardless of host locale). Processing order does NOT affect
 * final state — the ingest route is idempotent and re-runs a full per-account
 * FIFO replay after every file — but a stable order makes runs reproducible
 * and the on-screen status list predictable.
 */
export function sortByName<T extends { file: { name: string } }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const an = a.file.name;
    const bn = b.file.name;
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
}

export type BatchSummary = {
  total: number;
  /** done + skipped-duplicate + failed */
  processed: number;
  done: number;
  skippedDuplicate: number;
  failed: number;
  /** Sum of inserted events across successfully-ingested files. */
  totalInserted: number;
  /** Sum of duplicate events across ingested files. */
  totalDuplicates: number;
};

export function summarizeQueue(
  items: Pick<QueueItem, "status" | "insertedCount" | "duplicateCount">[],
): BatchSummary {
  const summary: BatchSummary = {
    total: items.length,
    processed: 0,
    done: 0,
    skippedDuplicate: 0,
    failed: 0,
    totalInserted: 0,
    totalDuplicates: 0,
  };
  for (const item of items) {
    if (isTerminal(item.status)) summary.processed++;
    if (item.status === "done") summary.done++;
    else if (item.status === "skipped-duplicate") summary.skippedDuplicate++;
    else if (item.status === "failed") summary.failed++;
    summary.totalInserted += item.insertedCount ?? 0;
    summary.totalDuplicates += item.duplicateCount ?? 0;
  }
  return summary;
}
