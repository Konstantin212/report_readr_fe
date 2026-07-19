"use client";
import { useState } from "react";
import { parseStatementInWorker } from "@/lib/brokers/client";
import type { IngestSummary } from "@/lib/imports/ingest";
import {
  sortByName,
  summarizeQueue,
  isTerminal,
  type QueueItem,
  type FileStatus,
} from "./upload-queue";

type ImportRow = {
  id: string;
  fileName: string;
  eventCount: number;
  status: string;
  createdAt: string;
};

export function UploadDropzone({ recent }: { recent: ImportRow[] }) {
  const [items, setItems] = useState<ImportRow[]>(recent);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const progress = summarizeQueue(queue);
  const allTerminal = queue.length > 0 && queue.every(q => isTerminal(q.status));

  function patchItem(id: string, patch: Partial<QueueItem>) {
    setQueue(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  }

  // Parse + hash + ingest a single file. Never throws — a failure is recorded
  // on the item so the queue can continue to the next file.
  async function processItem(item: QueueItem) {
    const { file } = item;
    try {
      patchItem(item.id, { status: "parsing", error: undefined });
      // The worker auto-detects broker (FF-JSON vs IBKR-CSV) and parses.
      const parsed = await parseStatementInWorker(file, parsedYearFor(file));

      patchItem(item.id, { status: "uploading" });
      const buf = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const fileHash = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      const res = await fetch("/api/imports/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          broker: parsed.broker,
          fileName: parsed.fileName ?? file.name,
          fileHash,
          taxYear: parsed.taxYear,
          account: {
            accountNumber: parsed.account.accountNumber,
            baseCurrency: parsed.account.baseCurrency,
            statementStartDate: parsed.statementStartDate,
            statementEndDate: parsed.statementEndDate,
          },
          events: parsed.events,
          snapshotQuotes: parsed.snapshotQuotes,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const summary = (await res.json()) as IngestSummary;
      patchItem(item.id, {
        status: summary.duplicate ? "skipped-duplicate" : "done",
        insertedCount: summary.insertedCount,
        duplicateCount: summary.duplicateCount,
      });
      setItems(prev => [
        {
          id: summary.importId,
          fileName: file.name,
          eventCount: parsed.events.length,
          status: summary.duplicate ? "DUPLICATE" : "PARSED",
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (err) {
      // A failed file must NOT abort the rest of the queue — record and move on.
      patchItem(item.id, { status: "failed", error: (err as Error).message });
    }
  }

  // Strictly sequential: one parse+ingest at a time. The ingest route fires
  // background enrichment per import, so we never post in parallel. Processing
  // ORDER does not affect final state (ingest is idempotent and re-runs a full
  // per-account FIFO replay after every file); the ascending-filename sort just
  // makes runs reproducible.
  async function runQueue(toProcess: QueueItem[]) {
    setProcessing(true);
    try {
      for (const item of toProcess) {
        await processItem(item);
      }
    } finally {
      setProcessing(false);
    }
  }

  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length || processing) return;
    // Each new selection starts a fresh batch (a batch of 1 behaves like the
    // old single-file flow). Retrying failed files re-queues within the batch.
    const batch = sortByName(
      files.map((file, idx) => ({
        id: `${Date.now()}-${idx}-${file.name}`,
        file,
        status: "pending" as FileStatus,
      })),
    );
    setQueue(batch);
    void runQueue(batch);
  }

  function retryFailed() {
    if (processing) return;
    const failed = queue.filter(it => it.status === "failed");
    if (!failed.length) return;
    const reset = failed.map(it => ({ ...it, status: "pending" as FileStatus, error: undefined }));
    setQueue(prev =>
      prev.map(it => (it.status === "failed" ? { ...it, status: "pending" as FileStatus, error: undefined } : it)),
    );
    void runQueue(reset);
  }

  function clearBatch() {
    if (processing) return;
    setQueue([]);
  }

  return (
    <section className="space-y-6">
      <label
        onDragOver={e => {
          e.preventDefault();
          if (!processing) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={`block bg-panel border-2 border-dashed rounded-[22px] p-6 lg:p-10 text-center cursor-pointer transition-colors ${
          dragOver ? "border-mint bg-mint/5" : "border-mint/40"
        } ${processing ? "opacity-60 cursor-wait" : ""}`}
      >
        <input
          type="file"
          hidden
          multiple
          accept=".csv,.json,.xml,.qfx,.xlsx"
          onChange={e => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = ""; // allow re-selecting the same file(s)
          }}
          disabled={processing}
        />
        <div className="text-2xl font-bold">
          {processing ? "Processing…" : "Drop statements here"}
        </div>
        <div className="text-muted text-sm mt-2">
          Freedom Finance JSON, Interactive Brokers Activity CSV, or Revolut XLSX — drop
          several at once. Parsed locally on your device.
        </div>
        <div className="text-muted text-xs mt-1">
          For Revolut, upload all three exports: savings statement, trading account
          statement and trading P&amp;L. The P&amp;L is the only one carrying dividends
          gross of withholding tax, which German tax reporting needs.
        </div>
      </label>

      {queue.length > 0 && (
        <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-mono text-xs uppercase tracking-widest text-dim">
              Batch · {progress.processed}/{progress.total} processed
            </h2>
            <div className="flex items-center gap-2">
              {allTerminal && progress.failed > 0 && (
                <button
                  onClick={retryFailed}
                  disabled={processing}
                  className="border border-amber/50 text-amber font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md hover:bg-amber/10 disabled:opacity-50"
                >
                  Retry failed ({progress.failed})
                </button>
              )}
              {allTerminal && (
                <button
                  onClick={clearBatch}
                  disabled={processing}
                  className="border border-border text-muted font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md hover:bg-white/5 disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <ul className="space-y-1.5">
            {queue.map(it => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-3 bg-panel2 border border-border rounded-lg px-3 py-2 text-sm"
              >
                <span className="truncate">{it.file.name}</span>
                <StatusBadge item={it} />
              </li>
            ))}
          </ul>

          {allTerminal && (
            <div className="font-mono text-[11px] text-muted pt-1 border-t border-border">
              Batch complete · <span className="text-mint">{progress.done} imported</span>
              {progress.skippedDuplicate > 0 && (
                <> · <span className="text-amber">{progress.skippedDuplicate} duplicate</span></>
              )}
              {progress.failed > 0 && (
                <> · <span className="text-bad">{progress.failed} failed</span></>
              )}
              {progress.totalInserted > 0 && <> · {progress.totalInserted} events added</>}
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="font-mono text-xs uppercase tracking-widest text-dim mb-2">Recently uploaded</h2>
        <ul className="space-y-2">
          {items.length === 0 && <li className="text-muted text-sm">No imports yet.</li>}
          {items.map(i => (
            <li key={i.id} className="flex justify-between bg-panel border border-border rounded-xl p-3 text-sm">
              <span>{i.fileName}</span>
              <span className="text-muted font-mono text-xs">
                {i.status} · {i.eventCount} events · {new Date(i.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// Per-file status indicator. Every wait state shows a visible cue (standing
// app rule): a spinner while parsing/uploading, terminal counts on success.
function StatusBadge({ item }: { item: QueueItem }) {
  switch (item.status) {
    case "pending":
      return <span className="font-mono text-[11px] text-dim shrink-0">Queued</span>;
    case "parsing":
      return (
        <span className="flex items-center gap-2 font-mono text-[11px] text-mint shrink-0">
          <Spinner /> Parsing…
        </span>
      );
    case "uploading":
      return (
        <span className="flex items-center gap-2 font-mono text-[11px] text-mint shrink-0">
          <Spinner /> Uploading…
        </span>
      );
    case "done":
      return (
        <span className="font-mono text-[11px] text-mint shrink-0">
          Imported · {item.insertedCount ?? 0} added
          {item.duplicateCount ? ` · ${item.duplicateCount} dup` : ""}
        </span>
      );
    case "skipped-duplicate":
      return <span className="font-mono text-[11px] text-amber shrink-0">Already imported</span>;
    case "failed":
      return (
        <span className="font-mono text-[11px] text-bad shrink-0 text-right max-w-[55%] truncate" title={item.error}>
          Failed · {item.error}
        </span>
      );
  }
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 rounded-full border-2 border-mint/30 border-t-mint animate-spin" />
  );
}

function parsedYearFor(file: File): number {
  const m = file.name.match(/20\d{2}/);
  return m ? Number(m[0]) : new Date().getFullYear();
}
