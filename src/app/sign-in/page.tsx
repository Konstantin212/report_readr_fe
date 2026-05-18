import { Github, LockKeyhole } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { getEnabledAuthProviders } from "@/lib/auth/providers";

export default function SignInPage() {
  const providers = getEnabledAuthProviders();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-md border border-border bg-card p-6 shadow-panel">
        <div className="mb-8 flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <LockKeyhole aria-hidden />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Private portfolio access</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Sign in with an allowlisted Google or GitHub account. Unauthorized emails are rejected before data access.
        </p>
        {providers.length === 0 ? (
          <p className="mt-8 rounded-md border border-tertiary/50 bg-tertiary/10 p-3 text-sm text-tertiary">
            Configure Google OAuth environment variables before production sign-in.
          </p>
        ) : (
          <div className="mt-8 grid gap-3">
            {providers.map((provider) => (
              <ButtonLink
                key={provider.id}
                href={`/api/auth/sign-in/${provider.id}`}
                variant={provider.id === "google" ? "primary" : "outline"}
                className="w-full"
              >
                {provider.id === "github" ? <Github size={18} aria-hidden /> : null}
                {provider.label}
              </ButtonLink>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
