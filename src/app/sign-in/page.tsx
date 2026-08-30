import Link from "next/link";

import { getEnabledAuthProviders } from "@/lib/auth/providers";
import { getSignupMode } from "@/lib/auth/signup-mode";
import { AuthModalTrigger } from "@/components/auth/auth-modal-trigger";

/**
 * The auth screen. Purely transactional: the hero, the three feature
 * cards and the broker list that used to live here now belong to the
 * public landing page at `/` (`src/app/(marketing)/page.tsx`), which is
 * the page crawlers actually reach. Keeping a second copy of that prose
 * here would split the ranking signal across two URLs and give us two
 * places to keep in sync.
 *
 * Server Component: reads which OAuth providers are actually configured
 * (`getEnabledAuthProviders()`) and the current sign-up mode, then hands
 * both down to the interactive `AuthModalTrigger` client leaf (the
 * "Sign in" / "Create account" buttons + the modal wrapping `AuthCard`),
 * keeping "use client" scoped to that leaf rather than the whole page.
 *
 * No data leaves the browser before sign-in — OAuth is a provider
 * redirect, and email/password submits go straight to better-auth's own
 * API routes.
 */
export default function SignIn() {
  const providers = getEnabledAuthProviders();
  const signupMode = getSignupMode();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-[440px] flex flex-col items-center gap-7 text-center">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-[10px] bg-mint text-bg font-mono font-bold flex items-center justify-center">◐</span>
          <span className="font-sans font-bold text-lg tracking-tight">
            folio<span className="text-mint">.</span>
          </span>
        </Link>
        <p className="text-muted text-[14px] leading-relaxed">
          Sign in to open your portfolio and your German tax draft.
        </p>
        <AuthModalTrigger providers={providers} signupMode={signupMode} />
      </div>
    </main>
  );
}
