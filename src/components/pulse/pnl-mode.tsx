"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Two complementary P/L views:
 *
 *   "broker"  Cost basis excludes broker commissions. Mirrors the
 *             "Entry Price × qty" cost the brokerage UI shows. No
 *             dividends layered in.
 *
 *   "net"     Cost basis includes commissions (German Anschaffungs-
 *             kosten) and the P/L further adds received dividends.
 *             This is the figure that maps to Anlage KAP and to total
 *             economic return.
 *
 * The choice is per-device (localStorage), defaults to "net" for
 * existing users so the historical numbers stay the same on first
 * load after this lands.
 */
export type PnlMode = "broker" | "net";

const STORAGE_KEY = "pulse.pnlMode";

type Ctx = { mode: PnlMode; setMode: (m: PnlMode) => void };
const PnlModeContext = createContext<Ctx>({ mode: "net", setMode: () => {} });

export function PnlModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PnlMode>("net");
  // Hydrate from localStorage after mount so the SSR shell renders with
  // the default; the toggle position then settles in the very first
  // client effect.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "broker" || stored === "net") setModeState(stored);
  }, []);
  const setMode = (m: PnlMode) => {
    setModeState(m);
    window.localStorage.setItem(STORAGE_KEY, m);
  };
  return <PnlModeContext.Provider value={{ mode, setMode }}>{children}</PnlModeContext.Provider>;
}

export function usePnlMode(): Ctx {
  return useContext(PnlModeContext);
}

/**
 * Visual toggle. Drop anywhere inside a `PnlModeProvider`.
 */
export function PnlModeToggle({ className }: { className?: string }) {
  const { mode, setMode } = usePnlMode();
  const base =
    "px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors";
  return (
    <div
      className={`inline-flex rounded-md border border-borderHard overflow-hidden ${className ?? ""}`}
      role="tablist"
      aria-label="P/L calculation mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "broker"}
        onClick={() => setMode("broker")}
        className={`${base} ${mode === "broker" ? "bg-mint/15 text-mint" : "text-muted hover:text-ink"}`}
        title="Cost basis excludes broker commissions; matches FF / IBKR Entry Price × Qty"
      >
        Broker
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "net"}
        onClick={() => setMode("net")}
        className={`${base} border-l border-borderHard ${mode === "net" ? "bg-mint/15 text-mint" : "text-muted hover:text-ink"}`}
        title="Cost includes commissions + dividends added to P/L (German Anschaffungskosten / Anlage KAP)"
      >
        Net
      </button>
    </div>
  );
}
