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
    { path: '/api/cron/fx',     schedule: '30 15 * * 1-5' },
    { path: '/api/cron/quotes', schedule: '0 21 * * 1-5' },
  ],
};
