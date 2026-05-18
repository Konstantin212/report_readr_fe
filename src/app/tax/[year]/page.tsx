import { Download, Landmark } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { MetricCard } from "@/components/app/metric-card";
import { ButtonLink } from "@/components/ui/button";
import { requireCurrentUser } from "@/lib/auth/server";
import { getTaxDraft } from "@/lib/data/portfolio";

export default async function TaxYearPage({ params }: { params: Promise<{ year: string }> }) {
  const user = await requireCurrentUser();
  const { year } = await params;
  const taxYear = Number(year);
  const { draft, storageMode } = await getTaxDraft(user.id, taxYear);

  return (
    <AppShell>
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-medium text-secondary">Anlage KAP draft</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{taxYear} German tax report</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Draft figures are grouped by taxable capital income, foreign dividends, share-sale gains, and foreign withholding tax.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={`/api/tax/${taxYear}/export?format=csv`} variant="outline">
              <Download size={17} aria-hidden />
              Evidence CSV
            </ButtonLink>
            <ButtonLink href={`/api/tax/${taxYear}/export?format=json`} variant="ghost">
              <Download size={17} aria-hidden />
              JSON
            </ButtonLink>
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-5 shadow-panel">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-md bg-tertiary text-tertiary-foreground">
              <Landmark aria-hidden />
            </span>
            <div>
              <p className="font-semibold">Evidence-led workflow</p>
              <p className="text-sm text-muted-foreground">Review totals before opening transaction evidence.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <MetricCard label="Capital income (Z19)" value={`€${draft.lines.Z19}`} detail="Dividends + interest gross" />
        <MetricCard label="Share-sale gains (Z22)" value={`€${draft.lines.Z22}`} detail="Net realized gains/losses" tone="tertiary" />
        <MetricCard label="WHT eligible (Z52)" value={`€${draft.lines.Z52}`} detail="Treaty-capped foreign WHT" tone="secondary" />
      </section>
      <section className="mt-8 grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
        <article className="rounded-md border border-border bg-card p-4 shadow-panel">
          <p className="text-sm font-semibold">Storage status</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {storageMode === "LOCAL"
              ? "No database is configured, so tax figures only update after DATABASE_URL is set."
              : "Tax draft loaded from database."}
          </p>
        </article>
        <article className="rounded-md border border-border bg-card p-4 shadow-panel">
          <p className="text-sm font-semibold">Evidence</p>
          {draft.evidence.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No tax evidence events for this year yet.</p>
          ) : (
            <div className="mt-4 grid gap-2">
              {draft.evidence.slice(0, 8).map((item) => (
                <div key={item.fingerprint} className="rounded-md border border-border bg-background/50 p-3 text-sm">
                  <p className="font-medium">
                    {item.date} — €{item.grossEur}
                  </p>
                  <p className="text-muted-foreground">
                    {item.ticker ?? item.symbol ?? "—"}
                    {item.country ? ` (${item.country})` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </AppShell>
  );
}
