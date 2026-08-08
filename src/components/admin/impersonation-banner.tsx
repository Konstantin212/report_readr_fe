"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * AC-5.2: visible, unmissable banner for the duration of an impersonated
 * session. Rendered app-wide (in the main `(app)` layout, not just the
 * admin subtree) since impersonation is full parity — the admin uses
 * the whole app as the target (design doc §15). AC-5.4's explicit exit.
 */
export function ImpersonationBanner({ targetEmail, targetName }: { targetEmail: string; targetName?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stop() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/panel/impersonate/stop", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      router.push("/admin" as never);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <div className="sticky top-0 z-30 -mx-3 sm:-mx-5 lg:-mx-7 px-3 sm:px-5 lg:px-7 py-2 bg-amber text-bg flex items-center justify-between gap-3 font-mono text-[11px]">
      <span>
        Viewing as <strong>{targetName ?? targetEmail}</strong> ({targetEmail}) — admin session
      </span>
      <div className="flex items-center gap-2">
        {error && <span className="text-bg/80">{error}</span>}
        <button
          onClick={stop}
          disabled={pending}
          className="bg-bg text-amber px-3 py-1 rounded-md uppercase tracking-widest font-semibold disabled:opacity-50"
        >
          {pending ? "Exiting…" : "Exit"}
        </button>
      </div>
    </div>
  );
}
