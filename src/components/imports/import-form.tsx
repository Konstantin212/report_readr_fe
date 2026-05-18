"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ImportSummary } from "@/lib/imports/import-utils";
import { saveImportSummary } from "@/lib/imports/local-import-store";

const brokerLabels = {
  INTERACTIVE_BROKERS: "Interactive Brokers",
  FREEDOM_FINANCE: "Freedom Finance",
} as const;

export function ImportForm() {
  const router = useRouter();
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSummary(null);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/imports", {
      method: "POST",
      body: formData,
    });

    const payload = await readImportResponse(response);
    setPending(false);

    if (!response.ok || !payload.summary) {
      setError(payload.error ?? "Import failed.");
      return;
    }

    if (!payload.summary.persisted) {
      saveImportSummary(payload.summary);
    }
    setSummary(payload.summary);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <label className="grid gap-2 text-sm font-medium">
        Statement file
        <input
          name="file"
          type="file"
          accept=".csv,.json,text/csv,application/json"
          required
          className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Tax year
        <input
          name="taxYear"
          type="number"
          min="2009"
          max="2100"
          defaultValue="2024"
          required
          className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" size={17} aria-hidden /> : null}
        Parse statement
      </Button>
      {error ? <p className="rounded-md border border-tertiary/50 bg-tertiary/10 p-3 text-sm text-tertiary">{error}</p> : null}
      {summary ? (
        <section className="rounded-md border border-secondary/50 bg-secondary/10 p-4" aria-live="polite">
          <div className="flex items-center gap-2 text-sm font-semibold text-secondary">
            <CheckCircle2 size={18} aria-hidden />
            Import parsed
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Broker</dt>
              <dd className="font-semibold">{brokerLabels[summary.broker]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Account</dt>
              <dd className="font-semibold">{summary.accountNumber}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Events</dt>
              <dd className="font-semibold">{summary.eventCount} normalized events</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Inserted / duplicate</dt>
              <dd className="font-semibold">
                {summary.insertedEventCount ?? 0} / {summary.duplicateEventCount ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Hash</dt>
              <dd className="break-all font-mono text-xs">{summary.fileHash.slice(0, 18)}...</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">
            Raw file was parsed in memory and discarded.
            {summary.persisted
              ? " Normalized events were saved."
              : " Import summary was saved locally in this browser. Add DATABASE_URL to save normalized events."}
            {summary.duplicate ? " This file hash was already imported." : ""}
          </p>
        </section>
      ) : null}
    </form>
  );
}

async function readImportResponse(response: Response): Promise<{ summary?: ImportSummary; error?: string }> {
  try {
    return (await response.json()) as { summary?: ImportSummary; error?: string };
  } catch {
    return { error: `Import failed with HTTP ${response.status}.` };
  }
}
