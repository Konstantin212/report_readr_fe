import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  installCommand: 'npx pnpm@9.15.0 install --frozen-lockfile',
  buildCommand: 'pnpm build',
  // Pin the function region to Frankfurt — closer to the user (Germany)
  // than the default iad1 (Washington DC). Cuts browser↔Vercel RTT from
  // ~200 ms each way to ~30 ms; that alone shaves ~350 ms off every
  // navigation. Note: Neon's free-tier endpoint may live in us-east; if
  // every DB query then crosses the Atlantic the savings can flip — but
  // with our Promise.all the queries run concurrently so the worst case
  // is one slow RTT, not six.
  regions: ['fra1'],
  crons: [
    { path: '/api/cron/fx',       schedule: '30 15 * * 1-5' },
    // Quotes cron: hourly at :30 past during the US-market window
    // (13:30-22:30 UTC), weekdays. Each run refreshes the 8 most-stale
    // held symbols — over a day every symbol gets refreshed 3-4 times
    // even for 20+ holdings, working around the free-tier provider
    // caps (TD = 8 credits/min, FMP = per-symbol paywall) that made a
    // single big sweep return only ~65% of the portfolio.
    { path: '/api/cron/quotes',   schedule: '30 13-22 * * 1-5' },
    // Daily Coinbase sync at 22:00 UTC, after most market closes. Pulls
    // /v2/accounts + transactions for every active crypto_accounts row
    // (incremental — uses last_sync_cursor so re-runs are cheap).
    { path: '/api/cron/coinbase', schedule: '0 22 * * *'    },
  ],
};
