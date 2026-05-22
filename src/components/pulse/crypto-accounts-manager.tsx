"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type CryptoAccountRow = {
  id: string;
  exchange: string;
  label: string | null;
  status: string;
  scopes: string;
  lastSyncAt: string | null;
  lastSyncEventCount: number;
  connectedAt: string;
};

/**
 * Settings panel for managing connected Coinbase keys. Server component
 * fetches the row list and passes it in; this component owns the connect
 * form and the disconnect buttons.
 */
export function CryptoAccountsManager({ initial }: { initial: CryptoAccountRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<CryptoAccountRow[]>(initial);
  const [blob, setBlob] = useState("");
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function connect(e: FormEvent) {
    e.preventDefault();
    if (!blob.trim()) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/crypto/coinbase/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blob: blob.trim(), label: label.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setRows((cur) => [body.account, ...cur]);
      setBlob("");
      setLabel("");
      setSuccess(`Connected · ${body.coinbaseUser?.email ?? body.coinbaseUser?.id ?? "Coinbase"}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function disconnect(id: string) {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/crypto/coinbase/${id}`, { method: "DELETE" });
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
      <form onSubmit={connect} className="mb-4 space-y-2">
        <label className="block">
          <div className="font-mono text-[10px] text-dim uppercase tracking-widest mb-1">CDP Key JSON</div>
          <textarea
            required
            placeholder='Paste the full {"name":"organizations/...","privateKey":"-----BEGIN EC PRIVATE KEY-----..."} blob'
            value={blob}
            onChange={(e) => setBlob(e.target.value)}
            rows={5}
            className="w-full bg-panel2 border border-borderHard rounded-md px-3 py-2 text-[11px] font-mono"
          />
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <label>
            <div className="font-mono text-[10px] text-dim uppercase tracking-widest mb-1">Label (optional)</div>
            <input
              type="text"
              placeholder="Main account"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full bg-panel2 border border-borderHard rounded-md px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pending || !blob.trim()}
            className="bg-mint text-bg font-mono text-[11px] uppercase tracking-widest px-4 py-2 rounded-md font-semibold disabled:opacity-50 h-fit"
          >
            {pending ? "Verifying…" : "Connect"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-md bg-bad/10 border border-bad/30 text-bad text-sm font-mono">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 px-3 py-2 rounded-md bg-mint/10 border border-mint/30 text-mint text-sm font-mono">
          {success}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-muted text-sm">
          No Coinbase account connected. Create a read-only CDP key at{" "}
          <a href="https://portal.cdp.coinbase.com/" target="_blank" rel="noreferrer" className="text-mint underline">
            portal.cdp.coinbase.com
          </a>{" "}
          and paste the JSON blob above.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{r.label ?? r.exchange}</div>
                <div className="font-mono text-[10px] text-muted">
                  <span className={r.status === "active" ? "text-mint" : "text-bad"}>● {r.status}</span>
                  {" · "}scopes: {r.scopes}
                  {" · "}connected {new Date(r.connectedAt).toISOString().slice(0, 10)}
                  {r.lastSyncAt
                    ? ` · last sync ${new Date(r.lastSyncAt).toISOString().slice(0, 10)} (${r.lastSyncEventCount} events)`
                    : " · not yet synced"}
                </div>
              </div>
              <button
                onClick={() => disconnect(r.id)}
                disabled={pending}
                className="border border-bad/40 text-bad font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-md hover:bg-bad/10 disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          ))}
          <div className="pt-3 text-[11px] text-muted">
            Note: disconnecting here removes the key from this app only. Also delete it in{" "}
            <a href="https://portal.cdp.coinbase.com/" target="_blank" rel="noreferrer" className="text-mint underline">
              portal.cdp.coinbase.com
            </a>{" "}
            to fully revoke.
          </div>
        </div>
      )}
    </div>
  );
}
