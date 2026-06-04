"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowLeft, ArrowRight } from "lucide-react";
import { PlatformCard, type Platform } from "./platform-card";

const DISMISS_KEY = "tour_dismissed";

type StepId = "welcome" | "selector" | Platform | "ready";

/**
 * First-run welcome tour. Walks a brand-new user through what the app
 * does, where to find statements for each broker they actually use, and
 * which page of the app each kind of data lands on.
 *
 * Trigger: `shouldShow` is true when the user has zero imports. The
 * client component also checks localStorage so a returning user who
 * once dismissed it doesn't get nagged.
 *
 * The user can always reopen from the "?" in the topbar, which sets
 * `forceOpen` and bypasses the localStorage check.
 */
export function WelcomeTour({
  shouldShow,
  firstName,
  forceOpen,
  onClose,
}: {
  shouldShow: boolean;
  firstName?: string | null;
  /** Bypass localStorage — used by the topbar "?" trigger. */
  forceOpen?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [selected, setSelected] = useState<Set<Platform>>(new Set());

  // First-run auto-open: only if the user is brand-new AND hasn't
  // dismissed the tour from this browser before.
  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setStepIdx(0);
      return;
    }
    if (!shouldShow) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    setOpen(true);
  }, [forceOpen, shouldShow]);

  // Compute the dynamic step list based on what the user has selected.
  const steps = useMemo<StepId[]>(() => {
    const out: StepId[] = ["welcome", "selector"];
    if (selected.has("ibkr")) out.push("ibkr");
    if (selected.has("freedom")) out.push("freedom");
    if (selected.has("coinbase")) out.push("coinbase");
    out.push("ready");
    return out;
  }, [selected]);

  const currentStep = steps[Math.min(stepIdx, steps.length - 1)];
  const isLast = stepIdx >= steps.length - 1;
  const isFirst = stepIdx === 0;
  const canAdvanceFromSelector = currentStep !== "selector" || selected.size > 0;

  const dismiss = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "1");
    }
    setOpen(false);
    onClose?.();
  }, [onClose]);

  const finish = useCallback(() => {
    dismiss();
    if (selected.has("ibkr") || selected.has("freedom")) {
      router.push("/upload");
    } else if (selected.has("coinbase")) {
      router.push("/settings");
    }
  }, [dismiss, router, selected]);

  const toggle = useCallback((p: Platform) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  // Close on ESC for keyboard-driven users.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-tour-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-bg/80 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="bg-panel border border-border w-full max-w-[640px] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header: progress dots + close */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === stepIdx ? "bg-mint" : i < stepIdx ? "bg-mint/40" : "bg-border"
                }`}
              />
            ))}
          </div>
          <span className="font-mono text-[10px] text-dim uppercase tracking-widest ml-1">
            step {stepIdx + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={dismiss}
            className="ml-auto text-muted hover:text-ink rounded-md p-1.5 -mr-1.5"
            aria-label="Close tour"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-8 py-6 sm:py-7 overflow-y-auto">
          {currentStep === "welcome" && <WelcomeCard firstName={firstName} />}
          {currentStep === "selector" && (
            <SelectorCard selected={selected} onToggle={toggle} />
          )}
          {currentStep === "ibkr" && <IbkrCard />}
          {currentStep === "freedom" && <FreedomCard />}
          {currentStep === "coinbase" && <CoinbaseCard />}
          {currentStep === "ready" && <ReadyCard selected={selected} />}
        </div>

        {/* Footer: nav */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
          <button
            type="button"
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={isFirst}
            className="px-3 py-2 rounded-md font-mono text-[11px] uppercase tracking-widest text-muted border border-border hover:text-ink hover:border-borderHard disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> back
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="px-3 py-2 rounded-md font-mono text-[11px] uppercase tracking-widest text-dim hover:text-ink"
          >
            skip tour
          </button>
          <div className="ml-auto">
            {isLast ? (
              <button
                type="button"
                onClick={finish}
                className="px-4 py-2.5 rounded-md bg-mint text-bg font-mono text-[11px] uppercase tracking-widest font-semibold flex items-center gap-1.5"
              >
                {finishCtaLabel(selected)} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
                disabled={!canAdvanceFromSelector}
                className="px-4 py-2.5 rounded-md bg-mint text-bg font-mono text-[11px] uppercase tracking-widest font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
              >
                next <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function finishCtaLabel(selected: Set<Platform>): string {
  if (selected.has("ibkr") || selected.has("freedom")) return "take me to upload";
  if (selected.has("coinbase")) return "open settings";
  return "explore the app";
}

function WelcomeCard({ firstName }: { firstName?: string | null }) {
  return (
    <div className="space-y-4">
      <h2 id="welcome-tour-title" className="font-bold text-[28px] tracking-tight leading-tight">
        Welcome{firstName ? `, ${firstName}` : ""}.
      </h2>
      <p className="text-ink/90 leading-relaxed">
        This is a small, friends-only portfolio + German tax tool. Upload your broker statements
        once, and you get:
      </p>
      <ul className="space-y-2 pl-1">
        <li className="flex gap-3 text-ink/90">
          <span className="text-mint mt-1">→</span>
          <span>A single view of <b>stocks, ETFs, bonds, dividends and crypto</b> across Freedom24, Interactive Brokers and Coinbase.</span>
        </li>
        <li className="flex gap-3 text-ink/90">
          <span className="text-mint mt-1">→</span>
          <span>An <b>Anlage KAP</b> and <b>Anlage SO</b> draft in EUR each January, ready to type into ELSTER.</span>
        </li>
      </ul>
      <p className="font-mono text-[11px] text-dim leading-relaxed pt-2">
        Takes about a minute. You can reopen the tour anytime from the <span className="text-muted">?</span> in the top bar.
      </p>
    </div>
  );
}

function SelectorCard({
  selected,
  onToggle,
}: {
  selected: Set<Platform>;
  onToggle: (p: Platform) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-bold text-[24px] tracking-tight leading-tight">
          Which platforms do you use?
        </h2>
        <p className="text-muted text-[14px] mt-1.5">
          Pick what you&apos;ll be importing — we&apos;ll skip the rest.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <PlatformCard
          platform="ibkr"
          selected={selected.has("ibkr")}
          onToggle={() => onToggle("ibkr")}
        />
        <PlatformCard
          platform="freedom"
          selected={selected.has("freedom")}
          onToggle={() => onToggle("freedom")}
        />
        <PlatformCard
          platform="coinbase"
          selected={selected.has("coinbase")}
          onToggle={() => onToggle("coinbase")}
        />
      </div>
      <p className="font-mono text-[11px] text-dim leading-relaxed">
        Multi-select. Pick at least one to continue, or hit <span className="text-muted">skip tour</span> if you just want to look around.
      </p>
    </div>
  );
}

function GuideCard({
  accentClass,
  badge,
  badgeBgClass,
  title,
  children,
}: {
  accentClass: string;
  badge: string;
  badgeBgClass: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className={`h-1 -mx-5 sm:-mx-8 -mt-6 sm:-mt-7 mb-2 ${accentClass}`} />
      <div className="flex items-center gap-2">
        <span className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 rounded ${badgeBgClass} text-white`}>
          {badge}
        </span>
      </div>
      <h2 className="font-bold text-[24px] tracking-tight leading-tight">{title}</h2>
      <div className="space-y-3 text-ink/90 leading-relaxed">{children}</div>
    </div>
  );
}

function IbkrCard() {
  return (
    <GuideCard
      accentClass="bg-brand-ibkr"
      badge="IBKR"
      badgeBgClass="bg-brand-ibkr"
      title="Get your IBKR Activity Statement"
    >
      <ol className="space-y-2.5 list-decimal pl-5">
        <li><b>Client Portal</b> → <b>Performance &amp; Reports</b> → <b>Statements</b>.</li>
        <li><b>Activity Statement</b> → period <b>Annual</b> (one per tax year).</li>
        <li>Format <b>CSV</b>, sections <b>all</b> (the default).</li>
        <li>Click <b>Run</b>, then <b>Download</b>.</li>
      </ol>
      <p>Repeat for each year you need.</p>
      <p className="font-mono text-[11px] text-dim leading-relaxed pt-2">
        Heads up: don&apos;t use the <b>Flex Query</b> CSV — column names differ. Use the standard
        Activity Statement.
      </p>
    </GuideCard>
  );
}

function FreedomCard() {
  return (
    <GuideCard
      accentClass="bg-brand-freedom"
      badge="FREEDOM24"
      badgeBgClass="bg-brand-freedom"
      title="Get your Freedom24 statement"
    >
      <ol className="space-y-2.5 list-decimal pl-5">
        <li>Open <b>Freedom24</b> → top right → <b>Statements</b>.</li>
        <li>Set the period to <b>All time</b> (or the earliest year you want taxes for).</li>
        <li>Choose <b>JSON</b> as the format.</li>
        <li>Click <b>Download</b>.</li>
      </ol>
      <p>
        You&apos;ll get a file like <code className="font-mono text-[12px] bg-panel2 px-1.5 py-0.5 rounded">2017xx_…_all.json</code>.
        Keep it on disk — you&apos;ll drop it on the upload page.
      </p>
      <p className="font-mono text-[11px] text-dim leading-relaxed pt-2">
        Why JSON? It has the full trade / dividend / WHT history with ISINs and FX. CSV exports
        drop fields the tax draft needs.
      </p>
    </GuideCard>
  );
}

function CoinbaseCard() {
  return (
    <GuideCard
      accentClass="bg-brand-coinbase"
      badge="COINBASE"
      badgeBgClass="bg-brand-coinbase"
      title="Connect Coinbase via API key"
    >
      <p>
        Crypto syncs live, not via file upload. You&apos;ll create a <b>read-only</b> CDP API key:
      </p>
      <ol className="space-y-2.5 list-decimal pl-5">
        <li><b>Coinbase Developer Platform</b> → <b>Portfolios</b> → <b>API keys</b> → <b>Create</b>.</li>
        <li>Permissions: <b>view only</b> (do not enable trade or send).</li>
        <li>Copy the key + secret.</li>
        <li>Paste them on the <b>Settings → Crypto</b> page here.</li>
      </ol>
      <p>
        A daily sync then pulls trades, staking rewards and balances into <b>§22</b> (staking income)
        and <b>§23</b> (private sale) automatically.
      </p>
    </GuideCard>
  );
}

function ReadyCard({ selected }: { selected: Set<Platform> }) {
  const pagesForSelection = () => {
    const out: { icon: string; label: string; desc: string }[] = [];
    if (selected.has("ibkr") || selected.has("freedom")) {
      out.push({ icon: "📈", label: "Positions", desc: "current holdings, FIFO cost basis, fees, dividends" });
      out.push({ icon: "💰", label: "Dividends", desc: "every distribution + WHT, top payers, monthly bars" });
      out.push({ icon: "📊", label: "Performance", desc: "equity curve vs benchmark, monthly returns" });
    }
    if (selected.has("coinbase")) {
      out.push({ icon: "₿", label: "Crypto", desc: "per-coin P/L, cost basis from sync history" });
    }
    out.push({ icon: "🇩🇪", label: "Tax · year", desc: "Anlage KAP draft, Anlage SO link for §22 / §23" });
    return out;
  };

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-[26px] tracking-tight leading-tight">
        {selected.size > 0 ? "You're ready." : "Welcome aboard."}
      </h2>
      <p className="text-ink/90 leading-relaxed">
        {selected.has("ibkr") || selected.has("freedom") ? (
          <>
            Drop your statements on the <b>Upload</b> page. Parsing happens in your browser; only
            normalized events leave it.
          </>
        ) : selected.has("coinbase") ? (
          <>
            Open <b>Settings → Crypto</b> to paste your Coinbase API key, then the first sync will
            populate everything.
          </>
        ) : (
          <>Have a look around — when you&apos;re ready to import data, the tour is always available from the <span className="text-muted">?</span> in the topbar.</>
        )}
      </p>
      <div className="space-y-2.5 pt-2">
        <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Once you&apos;ve uploaded:</div>
        {pagesForSelection().map((p) => (
          <div key={p.label} className="flex gap-3 items-start">
            <span className="w-8 text-center text-lg shrink-0">{p.icon}</span>
            <div>
              <div className="font-semibold text-ink">{p.label}</div>
              <div className="text-muted text-[13px]">{p.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
