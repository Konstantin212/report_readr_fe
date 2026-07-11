/**
 * Escape hatch for symbols that genuinely cannot be priced by ANY provider
 * reachable from our Vercel functions. The refresh cron skips these outright
 * — better to render a broker snapshot than a wrong-listing price.
 *
 * Currently EMPTY. It formerly held IEMM (iShares MSCI EM UCITS,
 * IE00B0M63177) on the premise that Yahoo blocks the Vercel egress IP — but
 * from the fra1 region justETF prices it by ISIN (EUR) and Yahoo JSON is
 * reachable, so the exclusion only froze it on a stale snapshot. The old
 * residential-IP script (scripts/refresh_quotes.py) is retired.
 *
 * Only add a symbol here after confirming (via the admin refresh route's
 * per-attempt trace) that every provider truly fails for it.
 */
export const EXTERNALLY_PRICED_SYMBOLS = new Set<string>([]);
