"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" onClick={signOut} disabled={pending} className="min-h-9 px-2 text-xs">
      <LogOut size={14} aria-hidden />
      Sign out
    </Button>
  );
}
