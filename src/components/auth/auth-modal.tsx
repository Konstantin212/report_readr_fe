"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { AuthCard, type Tab } from "./auth-card";
import type { AuthProviderLink } from "@/lib/auth/providers";
import type { SignupMode } from "@/lib/auth/signup-mode";

/**
 * Modal shell around AuthCard, opened from the header's "Sign in" /
 * "Create account" buttons. Mirrors the ESC + backdrop-click close pattern
 * used by WhyPotsModal / RealizedTradesModal — AuthCard itself is
 * unchanged, just relocated off the page's main scroll.
 */
export function AuthModal({
  open,
  onClose,
  providers,
  signupMode,
  initialTab,
}: {
  open: boolean;
  onClose: () => void;
  providers: AuthProviderLink[];
  signupMode: SignupMode;
  initialTab?: Tab;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[rgba(6,7,9,.72)] backdrop-blur flex items-center justify-center p-6"
      onClick={onClose}
      aria-hidden="false"
    >
      <div
        className="relative w-full max-w-[440px]"
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 z-10 w-[32px] h-[32px] rounded-md border border-borderHard bg-panel flex items-center justify-center text-muted hover:text-ink hover:bg-panel2 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <AuthCard providers={providers} signupMode={signupMode} initialTab={initialTab} />
      </div>
    </div>
  );
}
