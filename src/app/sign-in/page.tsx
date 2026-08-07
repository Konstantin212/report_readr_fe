import { getEnabledAuthProviders } from "@/lib/auth/providers";
import { getSignupMode } from "@/lib/auth/signup-mode";
import { AuthModalTrigger } from "@/components/auth/auth-modal-trigger";

/**
 * Public landing + sign-in. Visitors land here before they have a
 * session; the hero explains what the app does and a "Sign in" button in
 * the header opens the sign-in/sign-up card in a modal. Mobile collapses
 * to stacked cards in the same order.
 *
 * Server Component: reads which OAuth providers are actually configured
 * (`getEnabledAuthProviders()` — previously dead code, since this page
 * used to hardcode both OAuth buttons regardless of whether
 * GOOGLE_CLIENT_ID/GITHUB_CLIENT_ID were set) and the current sign-up
 * mode, then hands both down to the interactive `AuthModalTrigger` client
 * leaf (header button + modal, wrapping `AuthCard`'s OAuth buttons +
 * email/password sign-in/sign-up), keeping "use client" scoped to that
 * leaf rather than the whole page.
 *
 * No data leaves the browser before sign-in — OAuth is a provider
 * redirect, and email/password submits go straight to better-auth's own
 * API routes.
 */
export default function SignIn() {
  const providers = getEnabledAuthProviders();
  const signupMode = getSignupMode();

  return (
    <main className="min-h-screen">
      <div className="max-w-[1080px] mx-auto px-5 sm:px-7 py-10 sm:py-16 space-y-12 sm:space-y-16">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-[10px] bg-mint text-bg font-mono font-bold flex items-center justify-center">◐</span>
            <span className="font-sans font-bold text-lg tracking-tight">
              folio<span className="text-mint">.</span>
            </span>
          </div>
          <AuthModalTrigger providers={providers} signupMode={signupMode} />
        </div>

        {/* Hero */}
        <section className="space-y-5">
          <h1 className="font-bold text-[40px] sm:text-[56px] tracking-tight leading-[1.05]">
            Your portfolio.<br />
            Your German tax draft.<br />
            <span className="text-mint">In one place.</span>
          </h1>
          <p className="text-ink/80 text-[16px] sm:text-[18px] leading-relaxed max-w-[640px]">
            Track stocks, ETFs, bonds, dividends and crypto across <b>Freedom24</b>, <b>Interactive Brokers</b>{" "}
            and <b>Coinbase</b>, then export a ready-to-type <b>Anlage KAP / SO</b> draft each January.
          </p>
        </section>

        {/* Feature row */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FeatureCard
            icon="📊"
            title="One unified portfolio"
            body="FF JSON, IBKR CSV, Coinbase API — same model. Cash, FX, fees, corporate actions all reconciled."
          />
          <FeatureCard
            icon="🇩🇪"
            title="Anlage KAP + Anlage SO"
            body="Per-event ECB FX, FIFO cost basis, evidence CSV. The Z-line numbers you type into ELSTER, computed for you."
            accent="amber"
          />
          <FeatureCard
            icon="₿"
            title="§22 staking + §23 FIFO"
            body="Tracks the 365-day cliff for long-term tax-free gains and the €256 Freigrenze, so you know whether you owe anything."
            accent="pink"
          />
        </section>

        {/* What you'll need */}
        <section className="space-y-3">
          <h2 className="font-mono text-[11px] text-muted uppercase tracking-widest">What you&apos;ll need</h2>
          <ul className="space-y-2.5 text-ink/85">
            <li className="flex gap-3">
              <span className="text-brand-freedom shrink-0 font-mono">→</span>
              <span><b>Freedom24</b> → Statements → Download <b>All-Time JSON</b></span>
            </li>
            <li className="flex gap-3">
              <span className="text-brand-ibkr shrink-0 font-mono">→</span>
              <span><b>Interactive Brokers</b> → Reports → Activity → <b>Annual Activity CSV</b></span>
            </li>
            <li className="flex gap-3">
              <span className="text-brand-coinbase shrink-0 font-mono">→</span>
              <span><b>Coinbase</b> → API Key (CDP Portfolio) — <span className="text-dim">optional</span></span>
            </li>
          </ul>
          <p className="font-mono text-[11px] text-dim pt-2 leading-relaxed">
            We&apos;ll walk you through each one after sign-in.
          </p>
        </section>

        {/* Trust line */}
        <section className="border-t border-border pt-6 space-y-2">
          <p className="font-mono text-[11px] text-dim leading-relaxed max-w-[640px]">
            No data leaves your browser before you sign in. Statements are parsed locally;
            only normalized events are stored.
          </p>
          <p className="font-mono text-[11px] text-dim">
            <a href="/privacy" className="underline hover:text-muted">Privacy policy</a>
          </p>
        </section>
      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  accent = "mint",
}: {
  icon: string;
  title: string;
  body: string;
  accent?: "mint" | "amber" | "pink";
}) {
  const accentClass =
    accent === "amber" ? "text-amber" : accent === "pink" ? "text-pink" : "text-mint";
  return (
    <div className="bg-panel border border-border rounded-2xl p-5 space-y-3">
      <div className={`text-2xl ${accentClass}`}>{icon}</div>
      <div className="font-bold text-[15px] tracking-tight">{title}</div>
      <div className="text-muted text-[13px] leading-relaxed">{body}</div>
    </div>
  );
}
