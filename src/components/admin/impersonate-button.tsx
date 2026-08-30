"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * AC-5.1: confirm before impersonating. On success the session cookie
 * has already been swapped server-side (design doc §8.1 step 4) — this
 * just navigates away from the admin panel into the app root, where the
 * impersonation banner (AC-5.2) picks up from the now-active target
 * session.
 */
export function ImpersonateButton({ userId, userEmail }: { userId: string; userEmail: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/panel/users/${userId}/impersonate`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      router.push("/dashboard" as never);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-amber/40 text-amber font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md hover:bg-amber/10"
      >
        Impersonate
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
            <div className="font-bold text-lg mb-2">View as {userEmail}?</div>
            <p className="text-muted text-sm leading-relaxed">
              You&apos;ll browse the app as this user for up to 30 minutes. A banner stays visible the whole time,
              and you can exit back to your own account at any point. This is logged.
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
                className="bg-amber text-bg font-mono text-[11px] uppercase tracking-widest px-4 py-2 rounded-md font-semibold disabled:opacity-50"
              >
                {pending ? "Starting…" : "Start viewing as user"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
