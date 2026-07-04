"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { marginalRatePct } from "@/lib/tax/marginal-rate";

/**
 * Editable "Annual taxable income" row for the Settings → Tax card.
 * Optional value; it personalizes the KAP Zeile 4 Günstigerprüfung
 * recommendation on the tax page (worthwhile iff the §32a marginal rate is
 * below the 25 % Abgeltungsteuer). Async states are always visible
 * (spinner + "Saving…") per the app-wide feedback rule.
 */
export function TaxIncomeRow({
  initialIncome,
  filingStatus,
}: {
  initialIncome: string | null;
  filingStatus: "SINGLE" | "JOINT";
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialIncome ?? "");
  const [saved, setSaved] = useState(initialIncome ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = value.trim() !== saved;
  const n = Number(value);
  const rate = value.trim() && Number.isFinite(n) && n > 0 ? marginalRatePct(n, filingStatus) : null;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/tax-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxableIncomeEur: value.trim() === "" ? null : Number(value) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
      setSaved(data?.taxableIncomeEur ?? "");
      setValue(data?.taxableIncomeEur ?? "");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="py-2 border-t border-border/40">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px] text-muted">
          Annual taxable income
          <span
            className="ml-1 cursor-help text-dim"
            title="Optional (zu versteuerndes Einkommen, approx.). Personalizes the Anlage KAP Zeile 4 Günstigerprüfung recommendation — worthwhile only if your marginal income-tax rate is below the 25 % Abgeltungsteuer."
          >
            ⓘ
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={value}
            disabled={saving}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="e.g. 65000"
            className="w-28 bg-panel border border-border rounded-md px-2 py-1 text-right font-mono text-[12px] text-ink placeholder:text-dim focus:outline-none focus:border-mint/50 disabled:opacity-60"
          />
          <span className="font-mono text-[11px] text-dim">€/yr</span>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-mint/15 text-mint border border-mint/30 font-mono text-[10px] tracking-wider hover:bg-mint/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {rate !== null && (
        <div className="mt-1 text-right font-mono text-[10px] text-dim">
          ≈ {rate.toFixed(0)} % marginal rate → Günstigerprüfung{" "}
          {rate < 25 ? "recommended" : "not worthwhile"}
        </div>
      )}
      {error && !saving && (
        <div className="mt-1 text-right font-mono text-[10px] text-bad">{error}</div>
      )}
    </div>
  );
}
