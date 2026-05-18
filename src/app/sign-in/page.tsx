"use client";
import { authClient } from "@/lib/auth/client";

export default function SignIn() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="bg-panel border border-border rounded-2xl p-8 w-[420px] space-y-4">
        <div className="font-bold text-2xl">folio<span className="text-mint">.</span></div>
        <p className="text-muted text-sm">Private portfolio + German tax. Sign in with an authorized account.</p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
            className="block w-full text-center bg-mint text-bg font-mono text-xs uppercase tracking-widest py-3 rounded-lg"
          >
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => authClient.signIn.social({ provider: "github", callbackURL: "/" })}
            className="block w-full text-center border border-borderHard text-ink font-mono text-xs uppercase tracking-widest py-3 rounded-lg"
          >
            Continue with GitHub
          </button>
        </div>
      </div>
    </main>
  );
}
