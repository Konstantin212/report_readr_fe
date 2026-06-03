import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Server-rendered pagination. No client JS — each control is a `<Link>`
 * that updates the `page` query param. Works inside any Server
 * Component list. Preserve other filters by passing `preservedQuery`.
 *
 * Rendered as: ← Prev   1 2 … 12 13 14 … 99   Next →
 * With per-row meta: "showing N-M of TOTAL".
 */

export type PaginationProps = {
  /** Current page (1-indexed). */
  page: number;
  /** Items per page. */
  pageSize: number;
  /** Total items across all pages. */
  total: number;
  /** URL path the pagination links target (e.g. "/dividends"). */
  basePath: string;
  /** Query params to preserve when paging. */
  preservedQuery?: Record<string, string>;
  /** Override the singular/plural label ("dividend"/"dividends"). */
  itemLabel?: { singular: string; plural: string };
};

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  preservedQuery,
  itemLabel,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const hrefFor = (p: number) => {
    const usp = new URLSearchParams(preservedQuery ?? {});
    if (p > 1) usp.set("page", String(p));
    else usp.delete("page");
    const s = usp.toString();
    return `${basePath}${s ? `?${s}` : ""}`;
  };

  const noun = itemLabel
    ? (total === 1 ? itemLabel.singular : itemLabel.plural)
    : (total === 1 ? "item" : "items");

  const pageNumbers = pageWindow(page, totalPages);

  return (
    <div className="px-5 py-3 border-t border-border flex flex-wrap items-center gap-3 justify-between">
      <div className="font-mono text-[11px] text-muted">
        showing {first}–{last} of {total} {noun}
      </div>
      <nav className="flex items-center gap-1 font-mono text-[11px]" aria-label="Pagination">
        <PageLink href={hrefFor(Math.max(1, page - 1))} disabled={page === 1} label="←">
          prev
        </PageLink>
        {pageNumbers.map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="px-2 text-dim">…</span>
          ) : (
            <PageLink
              key={n}
              href={hrefFor(n)}
              active={n === page}
            >
              {String(n)}
            </PageLink>
          ),
        )}
        <PageLink href={hrefFor(Math.min(totalPages, page + 1))} disabled={page === totalPages} label="→">
          next
        </PageLink>
      </nav>
    </div>
  );
}

function PageLink({
  href,
  children,
  active = false,
  disabled = false,
  label,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const className = cn(
    "px-2.5 py-1 rounded-md border transition-colors",
    active
      ? "bg-mint/15 text-mint border-mint/30"
      : "text-muted border-border hover:border-borderHard hover:text-ink",
    disabled && "pointer-events-none opacity-40",
  );
  if (disabled) {
    return <span className={className} aria-disabled="true">{label ?? children}</span>;
  }
  return (
    <Link href={href as never} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

/**
 * Return a compact list of page numbers with ellipses for skipped
 * ranges. For 99 pages on page 50: [1, "…", 49, 50, 51, "…", 99].
 */
function pageWindow(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | "…"> = [];
  const window = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(window).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}
