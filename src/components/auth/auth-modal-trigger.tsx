"use client";

import { useState } from "react";

import { AuthModal } from "./auth-modal";
import type { Tab } from "./auth-card";
import type { AuthProviderLink } from "@/lib/auth/providers";
import type { SignupMode } from "@/lib/auth/signup-mode";

/**
 * Header action buttons that open the sign-in/sign-up modal, one per tab
 * ("Sign in" / "Create account") so each is reachable directly rather than
 * only via the in-modal tab switch. Kept as its own client leaf (rather
 * than folding into the server-rendered header row) so only the open/close
 * state is client-side.
 */
export function AuthModalTrigger({
  providers,
  signupMode,
}: {
  providers: AuthProviderLink[];
  signupMode: SignupMode;
}) {
  const [openTab, setOpenTab] = useState<Tab | null>(null);

  return (
    <>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setOpenTab("sign-in")}
          className="border border-borderHard text-ink font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-lg font-semibold"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setOpenTab("sign-up")}
          className="bg-mint text-bg font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-lg font-semibold"
        >
          Create account
        </button>
      </div>
      <AuthModal
        open={openTab !== null}
        onClose={() => setOpenTab(null)}
        providers={providers}
        signupMode={signupMode}
        initialTab={openTab ?? "sign-in"}
      />
    </>
  );
}
