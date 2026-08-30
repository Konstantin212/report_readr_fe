import Link from "next/link";

import { BROKER_SUMMARIES, type BrokerSummary } from "@/lib/onboarding/broker-instructions";

/**
 * The public landing page at `/`.
 *
 * Before this route existed the dashboard owned `/`, so an anonymous
 * request — every crawler included — was answered with a 307 to
 * `/sign-in` by `(app)/layout.tsx`'s `requireCurrentUser()`. The only
 * indexable page was a login form: thin, transactional, ranks for
 * nothing. This page gives the root URL content of its own.
 *
 * Deliberately free of dynamic APIs (no `headers()`, no `cookies()`, no
 * session read) so Next.js prerenders it at build time and Vercel serves
 * it from the edge cache with `x-nextjs-prerender: 1`. `force-static`
 * makes that a build-time guarantee rather than a convention: if someone
 * later adds a dynamic read here, the build fails instead of silently
 * turning the app's most important SEO surface dynamic.
 *
 * Signed-in visitors never see this page — `src/middleware.ts` bounces
 * `/` to `/dashboard` when a session cookie is present. That is a UX
 * redirect only; the actual auth gate stays in `(app)/layout.tsx`.
 */
export const dynamic = "force-static";

export default function Landing() {
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
          <Link
            href="/sign-in"
            className="border border-borderHard text-ink font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-lg font-semibold"
          >
            Sign in
          </Link>
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
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/sign-in"
              className="bg-mint text-bg font-mono text-xs uppercase tracking-widest px-5 py-3 rounded-lg font-semibold"
            >
              Create your account
            </Link>
            <Link
              href="/sign-in"
              className="border border-borderHard text-ink font-mono text-xs uppercase tracking-widest px-5 py-3 rounded-lg font-semibold"
            >
              Sign in
            </Link>
          </div>
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
            body="Per-event ECB FX, FIFO lot matching, evidence CSV. Anlage KAP / KAP-INV Zeile values computed for you, with the Anlage SO figures alongside."
            accent="amber"
          />
          <FeatureCard
            icon="₿"
            title="§22 staking + §23 FIFO"
            body="Separates §22 Nr. 3 staking income from §23 private-sale gains, tracks the one-year holding period, and shows each bucket against its own Freigrenze."
            accent="pink"
          />
        </section>

        {/* What you'll need */}
        <section className="space-y-3">
          <h2 className="font-mono text-[11px] text-muted uppercase tracking-widest">What you&apos;ll need</h2>
          <ul className="space-y-2.5 text-ink/85">
            {BROKER_SUMMARIES.map((summary) => (
              <BrokerLine key={summary.id} summary={summary} />
            ))}
          </ul>
          <p className="font-mono text-[11px] text-dim pt-2 leading-relaxed">
            We&apos;ll walk you through each one after sign-in.
          </p>
        </section>

        {/* Trust line */}
        <section className="border-t border-border pt-6 space-y-2">
          <p className="font-mono text-[11px] text-dim leading-relaxed max-w-[640px]">
            Your statement file is parsed in your browser and never uploaded. What travels to the
            server is the data read out of it — the normalized events and the position snapshot,
            holdings and closing prices included — plus the file name, a checksum and the account
            details needed to recognize a duplicate import. Client-side parsing keeps the document
            off our servers; it does not mean your portfolio is hidden from them.
          </p>
          <p className="font-mono text-[11px] text-dim leading-relaxed max-w-[640px]">
            Folio produces a draft for your own records — not a certified tax filing and not tax
            advice. Check the figures with your Steuerberater before you file.
          </p>
        </section>
      </div>
    </main>
  );
}

/**
 * One orientation line. The copy module owns the words; this owns the
 * chrome — the brand colour per broker is a Tailwind class name and has no
 * business in a plain-TypeScript copy module (the same split
 * `welcome-tour.tsx` uses for its `badge`).
 */
function BrokerLine({ summary }: { summary: BrokerSummary }) {
  const arrowClass =
    summary.id === "ibkr"
      ? "text-brand-ibkr"
      : summary.id === "freedom"
        ? "text-brand-freedom"
        : "text-brand-coinbase";
  return (
    <li className="flex gap-3">
      <span className={`${arrowClass} shrink-0 font-mono`}>&rarr;</span>
      <span>
        <b>{summary.label}</b> {summary.path.join(" \u2192 ")} <b>{summary.artifact.join(" \u00b7 ")}</b>
        {summary.note ? <span className="text-dim"> &mdash; {summary.note}</span> : null}
      </span>
    </li>
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
