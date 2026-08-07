"use client";
import Link from "next/link";
import { trackTaxYearChanged } from "@/lib/analytics-events";

/**
 * Year tab strip for the Tax page. The active year is decided by the URL
 * segment (`/tax/<year>`); this is a Client Component only so the tab click
 * can also fire `trackTaxYearChanged` (AC-TX1) — `onClick` doesn't call
 * `preventDefault`, so `Link` navigation is unaffected. Hidden when only a
 * single year is available (no value in showing one lonely button).
 */
export function TaxYearSelector({
  years,
  activeYear,
}: {
  years: number[];
  activeYear: number;
}) {
  if (years.length <= 1) return null;
  return (
    <div
      className="inline-flex rounded-md border border-borderHard overflow-hidden"
      role="tablist"
      aria-label="Tax year"
    >
      {years.map((y) => {
        const active = y === activeYear;
        return (
          <Link
            key={y}
            role="tab"
            aria-selected={active}
            href={`/tax/${y}` as never}
            onClick={() => trackTaxYearChanged(y)}
            className={`px-3 py-1.5 font-mono text-[11px] tracking-widest transition-colors border-l border-borderHard first:border-l-0 ${
              active ? "bg-mint/15 text-mint" : "text-muted hover:text-ink"
            }`}
          >
            {y}
          </Link>
        );
      })}
    </div>
  );
}
