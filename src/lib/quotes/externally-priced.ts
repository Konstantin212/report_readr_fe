/**
 * Symbols whose price cannot be fetched from any source reachable by our
 * Vercel functions. Yahoo blocks the egress IP range; Stooq only carries a
 * different-currency listing (e.g. EIMI.uk in GBP for IEMM.AS in EUR).
 *
 * The daily Stooq cron SKIPS these symbols outright — better to render `—`
 * in the Positions table than to ship a wrong-listing price. They are then
 * refreshed by an out-of-band script that runs on a residential-IP machine
 * (see `scripts/refresh_quotes.py`) and pushes results to
 * `/api/admin/quote-upload`.
 *
 * Add an entry here when you discover another symbol Stooq can't price
 * correctly. The diag endpoint (`/api/admin/positions-needing-quotes`)
 * then automatically picks it up for the next script run.
 */
export const EXTERNALLY_PRICED_SYMBOLS = new Set<string>([
  "IEMM", // iShares MSCI EM UCITS — Amsterdam EUR class (IEMM.AS).
          // Stooq only has the LSE GBP twin (EIMI). Yahoo has it but
          // blocks our Vercel IPs. Refreshed by the local script.
]);
