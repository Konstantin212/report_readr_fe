"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReviewTransaction } from "@/lib/data/portfolio";

type ReviewField = {
  name: "amountEur" | "realizedPnlEur" | "feeEur" | "withholdingTaxEur" | "cashAmountEur";
  label: string;
};

const reviewFields: ReviewField[] = [
  { name: "amountEur", label: "Income EUR" },
  { name: "realizedPnlEur", label: "Realized P/L EUR" },
  { name: "withholdingTaxEur", label: "Withholding tax EUR" },
  { name: "feeEur", label: "Fee EUR" },
  { name: "cashAmountEur", label: "Cash impact EUR" },
];

export function TaxReviewForm({ item }: { item: ReviewTransaction }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      [...formData.entries()].map(([key, value]) => [key, String(value)]),
    );

    const response = await fetch(`/api/review/transactions/${item.transactionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
      setError(body?.error ?? "Review update failed.");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-md border border-border bg-card p-4 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {item.date} - {item.type}
            {item.symbol ? ` - ${item.symbol}` : ""}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.broker} {item.accountNumber}
            {item.importFileName ? ` - ${item.importFileName}` : ""}
          </p>
        </div>
        <span className="rounded-md bg-tertiary/15 px-2 py-1 text-xs font-semibold text-tertiary">
          Review required
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {reviewFields.map((field) => (
          <label key={field.name} className="grid gap-2 text-xs font-semibold text-muted-foreground">
            {field.label}
            <input
              name={field.name}
              inputMode="decimal"
              defaultValue={defaultValue(item, field.name)}
              className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        ))}
      </div>
      <label className="grid gap-2 text-xs font-semibold text-muted-foreground">
        Review note
        <textarea
          name="reviewNote"
          defaultValue={item.reviewNote}
          rows={2}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" size={16} aria-hidden /> : null}
          Save review
        </Button>
        {saved ? (
          <span className="inline-flex items-center gap-2 text-sm text-secondary">
            <CheckCircle2 size={16} aria-hidden />
            Saved
          </span>
        ) : null}
        {error ? <span className="text-sm text-tertiary">{error}</span> : null}
      </div>
    </form>
  );
}

function defaultValue(item: ReviewTransaction, field: ReviewField["name"]): string {
  return item[field] ?? "";
}
