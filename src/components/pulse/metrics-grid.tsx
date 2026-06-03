import { cn } from "@/lib/utils";

/**
 * Responsive metric grid for the big-number hero rows used across the
 * Tax / Anlage SO / Dashboard pages. Single column on mobile, N columns
 * at `lg:`. Each metric renders a label + big value + optional subline.
 *
 * Use this anywhere you had `<div className="grid grid-cols-{3,4} gap-6">`
 * with three or four label/value/subline triplets — those were the
 * primary mobile-overflow source.
 *
 * Accent maps to the existing pulse palette tokens.
 */

export type HeroMetric = {
  label: string;
  value: string;
  subline?: string | null;
  /** Optional secondary line below the subline (e.g. for an inline pill). */
  trailing?: React.ReactNode;
  accent?: "ink" | "mint" | "amber" | "bad" | "auto";
  /** When accent="auto", sign() decides mint vs bad. */
  sign?: number;
  /** Override default 32px value text — used by smaller-secondary cells. */
  valueSize?: "xl" | "lg";
};

const ACCENT: Record<NonNullable<HeroMetric["accent"]>, string> = {
  ink: "text-ink",
  mint: "text-mint",
  amber: "text-amber",
  bad: "text-bad",
  auto: "",
};

function resolveColor(m: HeroMetric): string {
  if (m.accent === "auto") {
    if (m.sign === undefined) return "text-ink";
    return m.sign >= 0 ? "text-mint" : "text-bad";
  }
  return ACCENT[m.accent ?? "ink"];
}

export function MetricsGrid({
  metrics,
  columns = 3,
  className,
}: {
  metrics: HeroMetric[];
  /** Desktop column count (mobile is always 1). */
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const cols =
    columns === 2 ? "lg:grid-cols-2" :
    columns === 3 ? "lg:grid-cols-3" :
    "lg:grid-cols-4";
  return (
    <div className={cn("grid grid-cols-1 gap-5 lg:gap-6", cols, className)}>
      {metrics.map((m) => (
        <HeroMetricCell key={m.label} m={m} />
      ))}
    </div>
  );
}

function HeroMetricCell({ m }: { m: HeroMetric }) {
  const sizeClass = m.valueSize === "lg" ? "text-[24px] lg:text-[26px]" : "text-[28px] lg:text-[32px]";
  return (
    <div>
      <div className="font-mono text-[11px] text-dim uppercase tracking-widest">{m.label}</div>
      <div className={cn("font-bold num tracking-tight mt-1", sizeClass, resolveColor(m))}>
        {m.value}
      </div>
      {m.subline && (
        <div className="font-mono text-[11px] text-muted mt-1">{m.subline}</div>
      )}
      {m.trailing && <div className="mt-1">{m.trailing}</div>}
    </div>
  );
}
