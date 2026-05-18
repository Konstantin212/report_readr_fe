"use client";
import { useState } from "react";
import { parseStatementInWorker } from "@/lib/brokers/client";

type ImportRow = {
  id: string;
  fileName: string;
  eventCount: number;
  status: string;
  createdAt: string;
};

export function UploadDropzone({ recent }: { recent: ImportRow[] }) {
  const [items, setItems] = useState<ImportRow[]>(recent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File) {
    setBusy(true);
    setError(null);
    try {
      const parsed = await parseStatementInWorker(file, parsed_year_for(file));
      const buf = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const fileHash = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
      const res = await fetch("/api/imports/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          broker: parsed.account.broker,
          fileName: file.name,
          fileHash,
          taxYear: parsed.account.taxYear,
          account: parsed.account,
          events: parsed.events,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const summary = await res.json();
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
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <label className="block bg-panel border-2 border-dashed border-mint/40 rounded-[22px] p-8 text-center cursor-pointer">
        <input
          type="file"
          hidden
          accept=".csv,.json,.xml,.qfx"
          onChange={e => e.target.files?.[0] && handle(e.target.files[0])}
          disabled={busy}
        />
        <div className="text-2xl font-bold">{busy ? "Parsing…" : "Drop statements here"}</div>
        <div className="text-muted text-sm mt-2">
          Freedom Finance JSON or Interactive Brokers Activity CSV. Parsed locally on your device.
        </div>
      </label>

      {error && (
        <div className="bg-bad/10 border border-bad/30 text-bad rounded-xl p-3 text-sm">
          {error}
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

function parsed_year_for(file: File): number {
  const m = file.name.match(/20\d{2}/);
  return m ? Number(m[0]) : new Date().getFullYear();
}
