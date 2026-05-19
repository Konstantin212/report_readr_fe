"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function UserMenu({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.replace("/sign-in" as never);
    } catch {
      setSigningOut(false);
    }
  }

  const initials = (name ?? email ?? "U").slice(0, 2).toUpperCase();

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-9 h-9 rounded-[10px] bg-amber text-bg font-bold flex items-center justify-center hover:opacity-90"
      >
        {initials}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 bg-panel border border-border rounded-[14px] shadow-xl shadow-black/40 overflow-hidden z-50"
        >
          <div className="px-4 py-3 border-b border-border">
            {name && <div className="text-sm font-semibold text-ink truncate">{name}</div>}
            {email && <div className="font-mono text-[11px] text-muted truncate">{email}</div>}
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-ink hover:bg-panel2"
            role="menuitem"
          >
            <span className="font-mono text-mint">◐</span>
            <span>Settings</span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-bad hover:bg-panel2 disabled:opacity-50"
            role="menuitem"
          >
            <span className="font-mono">↪</span>
            <span>{signingOut ? "Signing out…" : "Log out"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
