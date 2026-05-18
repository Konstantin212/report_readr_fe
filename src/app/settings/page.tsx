import { ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { requireCurrentUser } from "@/lib/auth/server";
import { getAuthorizedEmails } from "@/lib/auth/allowlist";

const settings = [
  ["Authentication", "OAuth with email allowlist"],
  ["Storage", "Neon Postgres free tier"],
  ["Raw files", "Parsed in memory, then discarded"],
  ["Production AI", "Out of scope for v1"],
];

export default async function SettingsPage() {
  const user = await requireCurrentUser();
  const allowlist = getAuthorizedEmails();

  return (
    <AppShell>
      <section className="max-w-3xl">
        <p className="text-sm font-medium text-secondary">Settings</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Security and deployment defaults</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          These defaults keep the app private and compatible with Vercel Hobby while the first broker import workflows are built out.
        </p>
      </section>
      <section className="mt-8 rounded-md border border-border bg-card p-4 shadow-panel">
        <p className="text-sm font-semibold">Signed-in owner</p>
        <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>
        <p className="mt-4 text-xs text-muted-foreground">
          Allowlist entries: {allowlist.length > 0 ? allowlist.join(", ") : "not configured"}
        </p>
      </section>
      <section className="mt-8 grid gap-3">
        {settings.map(([label, value]) => (
          <article key={label} className="flex items-center justify-between gap-4 rounded-md border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-md bg-primary/15 text-primary">
                <ShieldCheck size={18} aria-hidden />
              </span>
              <p className="font-medium">{label}</p>
            </div>
            <p className="text-right text-sm text-muted-foreground">{value}</p>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
