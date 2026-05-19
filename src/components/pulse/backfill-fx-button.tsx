"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Result = {
  fxInserted?: number;
  rateMapSize?: number;
  recomputedTx?: number;
  replayedAccounts?: number;
};

export function BackfillFxButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/backfill-fx", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      setResult(body as Result);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        onClick={run}
        disabled={pending}
        className="border border-mint/40 text-mint font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md hover:bg-mint/10 disabled:opacity-50"
      >
        {pending ? "Backfilling…" : "Backfill historical FX"}
      </button>
      {result && (
        <div className="font-mono text-[11px] text-muted">
          FX rows: {result.fxInserted} · TX recomputed: {result.recomputedTx} · Replays: {result.replayedAccounts}
        </div>
      )}
      {error && (
        <div className="font-mono text-[11px] text-bad">{error}</div>
      )}
    </div>
  );
}
