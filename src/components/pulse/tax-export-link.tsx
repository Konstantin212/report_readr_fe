"use client";

import type { ReactNode } from "react";
import { trackTaxExportClicked } from "@/lib/analytics-events";

/**
 * Thin client-side wrapper around a plain `<a>` export link. The pages that
 * render tax exports (`tax-client.tsx`, `anlage-so/page.tsx`) are async
 * Server Components and can't take an `onClick` handler directly — this
 * component exists solely to bridge that boundary so the export link can
 * fire `trackTaxExportClicked` (AC-TX3) without converting the whole page to
 * a Client Component.
 */
export function TaxExportLink({
  href,
  form,
  format,
  className,
  children,
}: {
  href: string;
  form: "anlage_kap" | "anlage_so";
  format: "pdf" | "csv";
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={className} onClick={() => trackTaxExportClicked(form, format)}>
      {children}
    </a>
  );
}
