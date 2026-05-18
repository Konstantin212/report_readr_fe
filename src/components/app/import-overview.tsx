"use client";

import { useEffect, useMemo, useState } from "react";

import { MetricCard } from "@/components/app/metric-card";
import { readImportSummaries, type StoredImportSummary } from "@/lib/imports/local-import-store";

const brokerLabels = {
  INTERACTIVE_BROKERS: "Interactive Brokers",
  FREEDOM_FINANCE: "Freedom Finance",
} as const;

const brokerTone = {
  INTERACTIVE_BROKERS: "primary",
  FREEDOM_FINANCE: "secondary",
} as const;

const eventLabels: Record<string, string> = {
  TRADE: "trades",
  DIVIDEND: "dividends",
  INTEREST: "interest",
  FEE: "fees",
  WITHHOLDING_TAX: "taxes",
  FX_CONVERSION: "fx",
  CASH_TRANSFER: "cash",
  CORPORATE_ACTION: "actions",
  POSITION_SNAPSHOT: "snapshots",
};

export function DashboardImportOverview() {
  const summaries = useLocalImportSummaries();
  const latest = summaries[0];

  if (!latest) {
    return (
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Portfolio summary">
        <MetricCard label="Portfolio value" value="Awaiting import" detail="Connects after first statement" />
        <MetricCard label="Cash" value="EUR / USD" detail="Separated by broker account" tone="secondary" />
        <MetricCard label="Realized result" value="Draft" detail="Based on normalized events" tone="tertiary" />
        <MetricCard label="Tax evidence" value="Traceable" detail="Each figure links back to events" />
      </section>
    );
  }

  const totalEvents = summaries.reduce((total, summary) => total + summary.eventCount, 0);
  const accountCount = new Set(summaries.map((summary) => `${summary.broker}:${summary.accountNumber}`)).size;

  return (
    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Portfolio summary">
      <MetricCard
        label="Imported accounts"
        value={String(accountCount)}
        detail={`${summaries.length} statement ${summaries.length === 1 ? "summary" : "summaries"} in this browser`}
      />
      <MetricCard
        label="Latest import"
        value={brokerLabels[latest.broker]}
        detail={`${latest.accountNumber} - tax year ${latest.taxYear}`}
        tone={brokerTone[latest.broker]}
      />
      <MetricCard label="Normalized events" value={String(totalEvents)} detail={formatEventBreakdown(latest)} tone="secondary" />
      <MetricCard
        label="Storage"
        value={latest.persisted ? "Database" : "Browser local"}
        detail={latest.persisted ? "Normalized events are saved" : "Set DATABASE_URL for durable storage"}
        tone={latest.persisted ? "primary" : "tertiary"}
      />
    </section>
  );
}

export function PortfolioImportOverview() {
  const summaries = useLocalImportSummaries();
  const accounts = useMemo(() => groupByAccount(summaries), [summaries]);

  if (accounts.length === 0) {
    return (
      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <MetricCard label="Interactive Brokers" value="Not imported" detail="Stocks, bonds, cash" />
        <MetricCard label="Freedom Finance" value="Not imported" detail="Trades, dividends, fees" tone="secondary" />
      </section>
    );
  }

  return (
    <section className="mt-8 grid gap-4 md:grid-cols-2">
      {accounts.map((account) => (
        <MetricCard
          key={`${account.broker}:${account.accountNumber}`}
          label={brokerLabels[account.broker]}
          value={account.accountNumber}
          detail={`${account.eventCount} normalized events - ${account.baseCurrency ?? "mixed currencies"}`}
          tone={brokerTone[account.broker]}
        >
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border bg-background/60 px-2 py-1">Latest: {formatDate(account.importedAt)}</span>
            <span className="rounded-md border border-border bg-background/60 px-2 py-1">{formatEventBreakdown(account)}</span>
          </div>
        </MetricCard>
      ))}
    </section>
  );
}

function useLocalImportSummaries() {
  const [summaries, setSummaries] = useState<StoredImportSummary[]>([]);

  useEffect(() => {
    function refresh() {
      setSummaries(readImportSummaries());
    }

    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("portfolio-imports-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("portfolio-imports-updated", refresh);
    };
  }, []);

  return summaries;
}

function groupByAccount(summaries: StoredImportSummary[]) {
  const byAccount = new Map<string, StoredImportSummary>();

  for (const summary of summaries) {
    const key = `${summary.broker}:${summary.accountNumber}`;
    const existing = byAccount.get(key);

    if (!existing) {
      byAccount.set(key, summary);
      continue;
    }

    byAccount.set(key, {
      ...summary,
      eventCount: existing.eventCount + summary.eventCount,
      eventTypes: mergeEventTypes(existing.eventTypes, summary.eventTypes),
      importedAt: existing.importedAt > summary.importedAt ? existing.importedAt : summary.importedAt,
      persisted: Boolean(existing.persisted || summary.persisted),
    });
  }

  return Array.from(byAccount.values());
}

function mergeEventTypes(
  left: StoredImportSummary["eventTypes"],
  right: StoredImportSummary["eventTypes"],
): StoredImportSummary["eventTypes"] {
  const merged = { ...left };

  for (const [eventType, count] of Object.entries(right)) {
    merged[eventType as keyof StoredImportSummary["eventTypes"]] =
      (merged[eventType as keyof StoredImportSummary["eventTypes"]] ?? 0) + (count ?? 0);
  }

  return merged;
}

function formatEventBreakdown(summary: Pick<StoredImportSummary, "eventTypes">) {
  const parts = Object.entries(summary.eventTypes)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([eventType, count]) => `${count} ${eventLabels[eventType] ?? eventType.toLowerCase()}`);

  return parts.length > 0 ? parts.join(", ") : "No normalized events";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
