import { UploadCloud } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { ImportForm } from "@/components/imports/import-form";
import { requireCurrentUser } from "@/lib/auth/server";
import { getImportHistory } from "@/lib/data/portfolio";

export default async function ImportsPage() {
  const user = await requireCurrentUser();
  const history = await getImportHistory(user.id);

  return (
    <AppShell>
      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-sm font-medium text-secondary">Parse then delete</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Import broker statements</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Upload one IBKR activity CSV or Freedom Finance JSON statement at a time. The server computes a hash, normalizes events, and does not store the uploaded bytes.
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5 shadow-panel">
          <div className="mb-5 flex size-11 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <UploadCloud aria-hidden />
          </div>
          <ImportForm />
        </div>
      </section>
      {history.storageMode === "DATABASE" && history.imports.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Recent imports</h2>
          <div className="mt-4 grid gap-3">
            {history.imports.slice(0, 6).map((item) => (
              <article key={item.id} className="rounded-md border border-border bg-card p-4 shadow-panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      {brokerLabel(item.broker)} - {item.statementStartDate ?? item.taxYear} to {item.statementEndDate ?? item.taxYear}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {item.insertedEventCount} inserted / {item.duplicateEventCount} duplicate
                  </p>
                </div>
                <p className="mt-3 inline-flex rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground">
                  {importStatusLabel(item.insertedEventCount, item.duplicateEventCount, item.eventCount)}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function importStatusLabel(inserted: number, duplicate: number, total: number): string {
  if (total > 0 && duplicate === total) {
    return "Exact duplicate file";
  }

  if (inserted > 0 && duplicate > 0) {
    return "Overlapping statement merged";
  }

  return "New statement imported";
}

function brokerLabel(broker: string): string {
  return broker === "INTERACTIVE_BROKERS" ? "Interactive Brokers" : "Freedom Finance";
}
