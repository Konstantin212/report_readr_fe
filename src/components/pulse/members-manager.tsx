"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type AllowedEmailRow = {
  id: string;
  email: string;
  note: string | null;
  addedAt: string | Date;
};

/**
 * Admin-only Members panel. Lists the workspace allowlist (DB-backed)
 * and lets the admin add or revoke emails. Non-admins shouldn't see
 * this component at all — the page-level admin check handles that.
 */
export function MembersManager({ initial }: { initial: AllowedEmailRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<AllowedEmailRow[]>(initial);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/allowlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), note: note.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setRows((cur) => {
        if (cur.find((r) => r.id === body.row.id)) return cur;
        return [body.row, ...cur];
      });
      setEmail("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/allowlist/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setRows((cur) => cur.filter((r) => r.id !== id));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[2fr_1.5fr_auto] gap-2 mb-4">
        <input
          type="email"
          required
          placeholder="friend@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-panel2 border border-borderHard rounded-md px-3 py-2 text-sm font-mono"
        />
        <input
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="bg-panel2 border border-borderHard rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-mint text-bg font-mono text-[11px] uppercase tracking-widest px-4 py-2 rounded-md font-semibold disabled:opacity-50"
        >
          {pending ? "Adding…" : "Invite"}
        </button>
      </form>
      {error && (
        <div className="mb-3 px-3 py-2 rounded-md bg-bad/10 border border-bad/30 text-bad text-sm font-mono">
          {error}
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-muted text-sm">
          No one invited yet. Add an email above and share <code className="text-mint">/sign-in</code> with them.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm">{r.email}</div>
                {r.note && <div className="text-[11px] text-muted truncate">{r.note}</div>}
                <div className="font-mono text-[10px] text-dim">
                  added {new Date(r.addedAt).toISOString().slice(0, 10)}
                </div>
              </div>
              <button
                onClick={() => remove(r.id)}
                disabled={pending}
                className="border border-bad/40 text-bad font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-md hover:bg-bad/10 disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
