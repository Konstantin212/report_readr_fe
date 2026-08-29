import { Card } from "@/components/pulse/card";

/**
 * AC-OC3.2 — what a brand-new account sees instead of eight zero-valued
 * widgets, which read as a broken account rather than an empty one.
 *
 * A server component on purpose: it is derived purely from server data and
 * reads no browser storage, so it renders underneath the auto-opened welcome
 * tour and survives every dismiss path (AC-OC3.7). The way back to the
 * walkthrough is the topbar "?" that already exists, pointed at by copy
 * (AC-OC3.4) rather than by a second client-side trigger.
 */
export function FirstRunCard() {
  return (
    <main className="space-y-4">
      <Card>
        <h1 className="font-bold text-[26px] tracking-tight leading-tight">
          Let&apos;s get your data in.
        </h1>
        <p className="text-ink/90 leading-relaxed mt-2">
          Nothing here yet. Import a broker statement, or connect Coinbase, and this page fills in
          with your positions, dividends and tax draft.
        </p>
        <div className="flex flex-wrap gap-3 mt-5">
          <a
            href="/upload"
            className="bg-mint text-bg font-mono text-[11px] uppercase tracking-widest px-4 py-2.5 rounded-md font-semibold"
          >
            Upload a statement
          </a>
          <a
            href="/settings?section=crypto"
            className="border border-border text-muted hover:text-ink font-mono text-[11px] uppercase tracking-widest px-4 py-2.5 rounded-md"
          >
            Connect Coinbase
          </a>
        </div>
        <p className="font-mono text-[11px] text-dim leading-relaxed pt-5">
          Not sure where to get a statement? Reopen the walkthrough any time from{" "}
          <span className="text-muted">?</span> in the top bar.
        </p>
      </Card>
    </main>
  );
}
