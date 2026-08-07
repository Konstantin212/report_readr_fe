import type { Metadata } from "next";
import Link from "next/link";

/**
 * Privacy policy / Datenschutzerklärung.
 *
 * Closes the gap flagged repeatedly in
 * docs/superpowers/specs/2026-08-05-open-signup-design.md (§7.3/§22 item 4,
 * AC-29) and its companion
 * docs/superpowers/specs/2026-08-05-open-signup-data-lifecycle.md (AC-29):
 * this app had no privacy-policy route at all before open public sign-up
 * shipped. Content here is grounded directly in that data-lifecycle doc's
 * AC-25 (process inventory), AC-26 (table/column inventory), AC-27
 * (subprocessors), and AC-28 (retention) sections — not generic boilerplate.
 *
 * IMPORTANT (see architecture doc §26 for the full caveat): this is a
 * first-draft, technically-accurate-to-the-best-of-fact-finding document,
 * not a legally reviewed one. It has NOT been reviewed by a lawyer. Treat
 * every placeholder below (contact address, controller identity) as exactly
 * that — a placeholder — until replaced with real, confirmed values.
 */

export const metadata: Metadata = {
  title: "Privacy Policy — folio.",
  description: "How folio. collects, uses, and retains your data.",
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-8">
      <h2 className="font-bold text-[20px] tracking-tight">{title}</h2>
      <div className="text-ink/85 leading-relaxed space-y-3 text-[15px]">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen">
      <div className="max-w-[760px] mx-auto px-5 sm:px-7 py-10 sm:py-16 space-y-10">
        {/* Brand row */}
        <div className="flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-[10px] bg-mint text-bg font-mono font-bold flex items-center justify-center">
              ◐
            </span>
            <span className="font-sans font-bold text-lg tracking-tight">
              folio<span className="text-mint">.</span>
            </span>
          </Link>
        </div>

        <div className="space-y-2">
          <h1 className="font-bold text-[32px] sm:text-[40px] tracking-tight leading-[1.05]">
            Privacy Policy
          </h1>
          <p className="font-mono text-[11px] text-dim uppercase tracking-widest">
            Last updated: 2026-08-05 — Draft, pending legal review (see notice below)
          </p>
        </div>

        <div className="bg-panel border border-borderHard rounded-2xl p-5 space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-amber">Draft notice</p>
          <p className="text-ink/85 leading-relaxed text-[14px]">
            This policy was drafted by technically inspecting this app&apos;s own code and
            infrastructure, to be as accurate as possible about what actually happens to your
            data. It has <b>not</b> been reviewed by a lawyer and should not yet be treated as a
            final, binding compliance document. If you are relying on this app under GDPR/BDSG for
            a public deployment, have this reviewed before treating it as legally sufficient.
          </p>
        </div>

        <Section id="who-we-are" title="1. Who this policy covers">
          <p>
            folio. (&ldquo;the app&rdquo;, &ldquo;we&rdquo;) is a personal-investment and German
            tax-reporting tool, currently operated at{" "}
            <span className="font-mono text-[14px]">ptfolio.net</span> (and its predecessor{" "}
            <span className="font-mono text-[14px]">*.vercel.app</span> address, which continues
            to run alongside it).
          </p>
          <p className="text-dim text-[13px]">
            Placeholder — data controller: replace this paragraph with the operator&apos;s legal
            name and a postal address before relying on this policy, per Art. 13(1)(a) GDPR&apos;s
            identification requirement. Not resolved by this draft.
          </p>
        </Section>

        <Section id="what-we-collect" title="2. What data we collect">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <b>Account data:</b> email address, display name, and (if you sign in with Google or
              GitHub) the profile photo URL and email-verification claim your provider reports.
            </li>
            <li>
              <b>Password (if you sign up with email + password):</b> stored as a salted hash
              (scrypt, via our auth library) — we never store or transmit your plaintext password
              beyond the initial HTTPS submission.
            </li>
            <li>
              <b>Session metadata:</b> IP address and browser user-agent string for each signed-in
              session, used for security/session management.
            </li>
            <li>
              <b>Broker &amp; exchange statement contents you upload or connect:</b> the
              transactions, positions, dividends, and account data contained in the Freedom
              Finance / Interactive Brokers statement files you upload, or the balance and
              transaction data returned by Coinbase if you connect a Coinbase account.
            </li>
            <li>
              <b>Tax computation outputs:</b> the Anlage KAP / KAP-INV / SO figures the app derives
              from the above, and any optional settings you enter (e.g. approximate taxable income,
              used only to personalize one recommendation).
            </li>
          </ul>
        </Section>

        <Section id="why" title="3. Why we process this data (legal basis)">
          <p>
            Under Art. 6(1) GDPR, we rely on:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <b>Contract performance (Art. 6(1)(b)):</b> account credentials, uploaded statement
              data, and computed tax figures are processed because they are the core service you
              signed up to use — we cannot show you a portfolio or a tax draft without them.
            </li>
            <li>
              <b>Legitimate interest (Art. 6(1)(f)):</b> session IP address/user-agent, and
              rate-limiting of sign-in/sign-up attempts, are processed to keep the service secure
              (abuse prevention, account-takeover protection).
            </li>
          </ul>
          <p>
            We do not use your data for advertising, profiling, or any purpose beyond running the
            app for you.
          </p>
        </Section>

        <Section id="who-we-share-with" title="4. Who we share data with (subprocessors)">
          <p>
            We use the following third parties to run the app. Each receives only what it needs to
            perform its specific function:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <b>Vercel</b> — hosts the application itself (compute, routing).
            </li>
            <li>
              <b>Neon</b> — hosts our Postgres database (all account, statement, and tax data
              described in Section 2 lives here).
            </li>
            <li>
              <b>Resend</b> — sends transactional email only (email-verification and
              password-reset links). Resend receives your email address, and the email subject/body
              containing a one-time link — never your name, statement contents, or tax figures.
            </li>
            <li>
              <b>Google / GitHub</b> — only if you choose to sign in with one of these providers;
              they authenticate you and return your email, name, and profile photo to us.
            </li>
            <li>
              <b>Coinbase</b> — only if you choose to connect a Coinbase account: we use an API key
              you generate and control (stored encrypted, view-only scope) to read your balance and
              transaction history directly from Coinbase&apos;s API on your behalf. This is your own
              connected account, not a service we share your identity with independently.
            </li>
          </ul>
          <p>
            Separately, we look up <b>market prices</b> (stock/ETF/crypto quotes, FX rates) from
            Yahoo Finance, Financial Modeling Prep, Twelve Data, Stooq, and CoinGecko. These
            lookups are by <b>ticker symbol and date only</b> — no request to any of these
            providers ever includes your name, email, account identifiers, or any other personal
            data. We treat these as market-data lookups, not as processors of your personal data.
          </p>
          <p className="text-dim text-[13px]">
            Placeholder — Resend processing region: our understanding is that Resend processes
            this data in an EU region, consistent with sending from our own EU-verified domain, but
            this has not been independently re-confirmed against Resend&apos;s current dashboard/DPA
            in this draft. Confirm directly with Resend before relying on this statement.
          </p>
        </Section>

        <Section id="retention" title="5. How long we keep your data">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <b>While your account exists:</b> we retain your account and the statement/tax data
              you&apos;ve provided for as long as your account exists.
            </li>
            <li>
              <b>Abandoned, never-verified sign-ups:</b> if you create an account (email +
              password) and never complete email verification, and you have not uploaded any
              statement, connected any account, or generated any tax report, we automatically
              delete that account after 6 months of inactivity. If you have imported any real
              data, this automatic deletion does not apply to you, regardless of verification
              status.
            </li>
            <li>
              <b>Password-reset request records:</b> deleted automatically once used or within a
              short time of expiring (these never contain more than a one-time token).
            </li>
          </ul>
          <p>
            German tax law may separately require certain financial records to be retained for
            statutory periods independent of this policy or of any erasure request — this is a
            general legal consideration for financial-record-keeping tools and is not specific to
            how this app is built.
          </p>
        </Section>

        <Section id="your-rights" title="6. Your rights">
          <p>
            Under GDPR, you have the right to request access to, rectification of, erasure of, or
            a portable copy of your personal data, and the right to object to certain processing.
            You also have the right to lodge a complaint with your local data-protection
            supervisory authority.
          </p>
          <div className="bg-panel border border-borderHard rounded-2xl p-5 space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-widest text-amber">
              Known gap
            </p>
            <p className="text-[14px] leading-relaxed">
              There is currently no self-service &ldquo;delete my account&rdquo; option in the
              app. The only automated deletion today is the abandoned, never-verified sign-up
              sweep described in Section 5 — a verified, active user has no in-product way to
              erase their own account and data yet. Until a self-service option ships, please
              contact us directly (see Section 7) to request erasure, rectification, or a copy of
              your data.
            </p>
          </div>
        </Section>

        <Section id="contact" title="7. Contact">
          <p className="text-dim text-[13px]">
            Placeholder — replace with a real, monitored contact address before this policy is
            relied upon:{" "}
            <span className="font-mono text-[14px] text-ink/85">privacy@ptfolio.net</span>
          </p>
        </Section>

        <div className="border-t border-border pt-6">
          <Link href="/" className="font-mono text-[11px] uppercase tracking-widest text-mint">
            ← Back
          </Link>
        </div>
      </div>
    </main>
  );
}
