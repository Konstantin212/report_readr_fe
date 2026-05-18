import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { TaxReviewForm } from "@/components/app/tax-review-form";
import { ButtonLink } from "@/components/ui/button";
import { requireCurrentUser } from "@/lib/auth/server";
import { getReviewTransactions } from "@/lib/data/portfolio";

export default async function TaxReviewPage({ params }: { params: Promise<{ year: string }> }) {
  const user = await requireCurrentUser();
  const { year } = await params;
  const taxYear = Number(year);
  const items = await getReviewTransactions(user.id, taxYear);

  return (
    <AppShell>
      <section className="max-w-3xl">
        <p className="text-sm font-medium text-secondary">Tax review</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{taxYear} EUR value review</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Add reviewed EUR values from broker reports before using the Anlage KAP draft. Unresolved rows stay out of filing totals.
        </p>
        <ButtonLink href={`/tax/${taxYear}`} variant="ghost" className="mt-5 px-0">
          <ArrowLeft size={16} aria-hidden />
          Back to tax draft
        </ButtonLink>
      </section>

      <section className="mt-8 grid gap-4">
        {items.length === 0 ? (
          <article className="rounded-md border border-border bg-card p-5 text-sm text-muted-foreground shadow-panel">
            No unresolved tax review items for this year.
          </article>
        ) : (
          items.map((item) => <TaxReviewForm key={item.transactionId} item={item} />)
        )}
      </section>
    </AppShell>
  );
}
