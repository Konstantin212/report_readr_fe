"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * AC-4.1 confirmation: irreversibility is stated up front, and the
 * delete button stays disabled until the admin types the target's email
 * exactly. This is a UI-only safety net (design doc §7.1) — the server
 * doesn't re-validate the typed string, since the same authenticated
 * admin identity performs the action either way.
 */
export function DeleteUserButton({ userId, userEmail }: { userId: string; userEmail: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = typed.trim().toLowerCase() === userEmail.toLowerCase();

  async function confirmDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/panel/users/${userId}`, { method: "DELETE" });
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
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-bad/40 text-bad font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md hover:bg-bad/10"
      >
        Delete account
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
            <div className="font-bold text-lg mb-2">Delete this account?</div>
            <p className="text-muted text-sm leading-relaxed">
              This permanently deletes <span className="text-ink font-mono">{userEmail}</span> and every
              transaction, lot, realized match, tax report, and setting they own. This cannot be undone.
            </p>
            <label htmlFor="admin-delete-confirm" className="block mt-4 font-mono text-[10px] text-dim uppercase tracking-widest">
              Type the email to confirm
            </label>
            <input
              id="admin-delete-confirm"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={userEmail}
              className="mt-1 w-full bg-panel2 border border-borderHard rounded-md px-3 py-2 text-sm font-mono"
            />
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
                disabled={pending || !confirmed}
                onClick={confirmDelete}
                className="bg-bad text-bg font-mono text-[11px] uppercase tracking-widest px-4 py-2 rounded-md font-semibold disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
