import { requireCurrentUser } from "@/lib/auth/server";
import { getTaxData } from "@/lib/data/tax";
import { ElsterValuesCard } from "@/components/pulse/elster-values-card";
import { PreSubmitChecklist } from "@/components/pulse/pre-submit-checklist";

export default async function ElsterPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const user = await requireCurrentUser();
  const { year } = await params;
  const yearNum = Number(year);
  const d = await getTaxData(user.id, yearNum);

  return (
    <main className="space-y-4">
      <div className="space-y-2">
        <a
          href={`/tax/${yearNum}`}
          className="font-mono text-[11px] text-muted hover:text-ink inline-block"
        >
          ← Back to Tax
        </a>
        <h1 className="text-2xl font-bold tracking-tight">
          ELSTER values
          <span className="font-mono text-sm text-muted ml-2 tracking-wider block lg:inline">
            {yearNum} · Anlage KAP / KAP-INV
          </span>
        </h1>
      </div>

      <ElsterValuesCard draft={d.kapV2} reconciliation={d.reconciliation} />
      <PreSubmitChecklist draft={d.kapV2} />
    </main>
  );
}
