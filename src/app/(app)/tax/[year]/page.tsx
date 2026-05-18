import { requireCurrentUser } from "@/lib/auth/server";
import { buildAnlageKap } from "@/lib/tax/german-tax";
import { loadTaxInputs } from "@/lib/data/tax";
import { Card } from "@/components/pulse/card";

export default async function TaxPage({ params }: { params: Promise<{ year: string }> }) {
  const user = await requireCurrentUser();
  const { year } = await params;
  const yearNum = Number(year);
  const inputs = await loadTaxInputs(user.id, yearNum);
  const draft = buildAnlageKap(inputs);
  const LINES = [
    ["Z19", "Capital income (gross)"],
    ["Z20", "of which foreign"],
    ["Z22", "of which from share sales (net)"],
    ["Z41", "Already-paid AbgSt"],
    ["Z51", "Foreign WHT paid"],
    ["Z52", "WHT eligible for offset"],
  ] as const;
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Anlage KAP · {year}</h1>
      <Card>
        <div className="space-y-2 font-mono">
          {LINES.map(([k, label]) => (
            <div key={k} className="flex justify-between items-baseline border-b border-border py-2">
              <div>
                <span className="text-mint">{k}</span>
                <span className="text-muted ml-3 text-sm">{label}</span>
              </div>
              <span className="num text-lg">€{draft.lines[k as keyof typeof draft.lines]}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-6">
          <a className="bg-mint text-bg px-4 py-2 rounded-lg font-mono uppercase text-xs"
             href={`/tax/${year}/export?format=pdf`}>Export PDF</a>
          <a className="border border-borderHard text-ink px-4 py-2 rounded-lg font-mono uppercase text-xs"
             href={`/tax/${year}/export?format=csv`}>CSV evidence</a>
        </div>
      </Card>
    </main>
  );
}
