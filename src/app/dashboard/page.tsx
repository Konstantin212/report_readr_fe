import { ArrowRight, FileUp, Landmark } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { DashboardImportOverview } from "@/components/app/import-overview";
import { MetricCard } from "@/components/app/metric-card";
import { ButtonLink } from "@/components/ui/button";
import { requireCurrentUser } from "@/lib/auth/server";
import { getDashboardSummary } from "@/lib/data/portfolio";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const summary = await getDashboardSummary(user.id);

  return (
    <AppShell>
      <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div>
          <p className="text-sm font-medium text-secondary">2024 tax year</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            A quiet cockpit for both broker portfolios.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Import statements, review portfolio state, and build Anlage KAP draft figures without turning the app into a spreadsheet.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/imports">
              <FileUp size={18} aria-hidden />
              Import statement
            </ButtonLink>
            <ButtonLink href="/tax/2024" variant="outline">
              <Landmark size={18} aria-hidden />
              Review tax draft
            </ButtonLink>
          </div>
        </div>
        <aside className="rounded-md border border-border bg-card p-4 shadow-panel">
          <p className="text-sm font-semibold">Next action</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Upload the latest IBKR CSV or Freedom Finance JSON. Raw files are parsed in memory and discarded.
          </p>
          <ButtonLink href="/imports" variant="ghost" className="mt-5 px-0">
            Open imports
            <ArrowRight size={16} aria-hidden />
          </ButtonLink>
        </aside>
      </section>

      {summary.storageMode === "LOCAL" ? (
        <DashboardImportOverview />
      ) : (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Portfolio summary">
          <MetricCard label="Imported accounts" value={String(summary.accountCount)} detail={`${summary.totalEvents} normalized events`} />
          <MetricCard
            label="Latest import"
            value={summary.latestImport ? brokerLabel(summary.latestImport.broker) : "None"}
            detail={summary.latestImport ? `${summary.latestImport.insertedEventCount} inserted, ${summary.latestImport.duplicateEventCount} duplicate` : "Upload a statement"}
            tone="secondary"
          />
          <MetricCard label="Cash impact" value={`€${summary.ledger.cashByCurrencyEur}`} detail={formatCash(summary.ledger.cashByCurrency)} tone="tertiary" />
          <MetricCard
            label="Review alerts"
            value={String(summary.reviewAlertCount)}
            detail={summary.reviewAlertCount > 0 ? "Open tax evidence before filing" : "No open review flags"}
          />
        </section>
      )}
    </AppShell>
  );
}

function formatCash(cashByCurrency: Record<string, string>): string {
  const entries = Object.entries(cashByCurrency);
  return entries.length > 0 ? entries.map(([currency, amount]) => `${amount} ${currency}`).join(", ") : "No cash events";
}

function brokerLabel(broker: string): string {
  return broker === "INTERACTIVE_BROKERS" ? "Interactive Brokers" : "Freedom Finance";
}
