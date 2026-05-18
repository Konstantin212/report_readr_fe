import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  detail,
  tone = "primary",
  children,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "primary" | "secondary" | "tertiary";
  children?: ReactNode;
}) {
  const toneClasses = {
    primary: "from-primary/18 to-primary/5",
    secondary: "from-secondary/18 to-secondary/5",
    tertiary: "from-tertiary/18 to-tertiary/5",
  };

  return (
    <article className={cn("rounded-md border border-border bg-card p-4 shadow-panel", "bg-gradient-to-br", toneClasses[tone])}>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-4 text-3xl font-semibold leading-tight">{value}</p>
      {detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}
      {children}
    </article>
  );
}
