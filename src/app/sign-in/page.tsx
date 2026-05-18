export default function SignIn() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="bg-panel border border-border rounded-2xl p-8 w-[420px] space-y-4">
        <div className="font-bold text-2xl">folio<span className="text-mint">.</span></div>
        <p className="text-muted text-sm">Private portfolio + German tax. Sign in with an authorized account.</p>
        <div className="space-y-2">
          <a className="block text-center bg-mint text-bg font-mono text-xs uppercase tracking-widest py-3 rounded-lg"
             href="/api/auth/sign-in/social?provider=google&callbackURL=/">Continue with Google</a>
          <a className="block text-center border border-borderHard text-ink font-mono text-xs uppercase tracking-widest py-3 rounded-lg"
             href="/api/auth/sign-in/social?provider=github&callbackURL=/">Continue with GitHub</a>
        </div>
      </div>
    </main>
  );
}
