"use client";
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { authClient } from "@/lib/auth/client";
import { isPasswordLongEnough, mapAuthErrorMessage } from "@/components/auth/auth-card";

/**
 * AC-17/AC-18/AC-20: the second hop of the forgot-password flow. The
 * email link (built by better-auth's own `/reset-password/:token` GET
 * route) redirects the browser here with either `?token=<valid-token>`
 * (verified server-side already) or `?error=INVALID_TOKEN` (expired,
 * already used, or malformed — password.mjs:115/117) and no token at
 * all. We treat "no token" the same as an explicit error, per §16.2's
 * "don't show a confusing empty form" guidance.
 *
 * Wrapped in Suspense because `useSearchParams()` requires it for this
 * otherwise-static client page to build (Next.js App Router convention).
 */
export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-[440px] mx-auto px-5 sm:px-7 py-10 sm:py-16">
        <Suspense fallback={null}>
          <ResetPasswordCard />
        </Suspense>
      </div>
    </main>
  );
}

function ResetPasswordCard() {
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidToken, setInvalidToken] = useState(false);
  const [done, setDone] = useState(false);

  if (!token || linkError || invalidToken) {
    return (
      <div className="bg-panel border border-border rounded-2xl p-6 sm:p-7 space-y-4">
        <div className="font-bold text-[22px] tracking-tight">Link expired or already used</div>
        <p className="text-muted text-[13px] leading-relaxed">
          This password reset link is no longer valid. Request a new one from the sign-in page.
        </p>
        <a
          href="/sign-in"
          className="block w-full text-center bg-mint text-bg font-mono text-xs uppercase tracking-widest py-3 rounded-lg font-semibold"
        >
          Back to sign in
        </a>
      </div>
    );
  }

  if (done) {
    return (
      <div className="bg-panel border border-border rounded-2xl p-6 sm:p-7 space-y-4">
        <div className="font-bold text-[22px] tracking-tight">Password updated</div>
        <p className="text-muted text-[13px] leading-relaxed">
          Your old password no longer works. Sign in with your new one.
        </p>
        <a
          href="/sign-in"
          className="block w-full text-center bg-mint text-bg font-mono text-xs uppercase tracking-widest py-3 rounded-lg font-semibold"
        >
          Back to sign in
        </a>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isPasswordLongEnough(password)) {
      setError(mapAuthErrorMessage("PASSWORD_TOO_SHORT"));
      return;
    }
    setPending(true);
    try {
      const { error: resetError } = await authClient.resetPassword({ newPassword: password, token: token as string });
      if (resetError) {
        if (resetError.code === "INVALID_TOKEN") {
          setInvalidToken(true);
        } else {
          setError(mapAuthErrorMessage(resetError.code, resetError.message));
        }
        return;
      }
      setDone(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-panel border border-border rounded-2xl p-6 sm:p-7 space-y-4">
      <div className="font-bold text-[22px] tracking-tight">Choose a new password</div>
      <input
        type="password"
        name="password"
        autoComplete="new-password"
        required
        placeholder="New password (min. 8 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full bg-panel2 border border-borderHard rounded-lg px-3 py-2.5 text-sm font-mono"
      />
      {error && (
        <div className="px-3 py-2 rounded-lg bg-bad/10 border border-bad/30 text-bad text-[12px] font-mono">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="block w-full text-center bg-mint text-bg font-mono text-xs uppercase tracking-widest py-3 rounded-lg font-semibold disabled:opacity-50"
      >
        {pending ? "…" : "Update password"}
      </button>
    </form>
  );
}
