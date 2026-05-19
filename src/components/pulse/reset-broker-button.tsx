"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResetBrokerButton({
  brokerAccountId,
  brokerLabel,
  accountNumber,
}: {
  brokerAccountId: string;
  brokerLabel: string;
  accountNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/imports/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brokerAccountId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-bad/40 text-bad font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md hover:bg-bad/10"
      >
        Reset
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-panel border border-border rounded-[22px] p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-bold text-lg mb-2">Reset {brokerLabel} data?</div>
            <p className="text-muted text-sm leading-relaxed">
              This will permanently delete every imported transaction, lot, realized
              match, and position for{" "}
              <span className="text-ink font-mono">{accountNumber}</span>.
              You can re-upload statements afterwards to rebuild the ledger with the
              latest parser fixes.
            </p>
            {error && (
              <div className="mt-3 px-3 py-2 rounded-md bg-bad/10 border border-bad/30 text-bad text-sm font-mono">
                {error}
              </div>
            )}
            <div className="flex gap-2 mt-5 justify-end">
              <button
                disabled={pending}
                onClick={() => setOpen(false)}
                className="border border-borderHard text-ink font-mono text-[11px] uppercase tracking-widest px-4 py-2 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={pending}
                onClick={confirm}
                className="bg-bad text-bg font-mono text-[11px] uppercase tracking-widest px-4 py-2 rounded-md font-semibold disabled:opacity-50"
              >
                {pending ? "Resetting…" : "Reset data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
