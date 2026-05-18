import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  installCommand: 'pnpm install --frozen-lockfile',
  buildCommand: 'pnpm build',
  crons: [
    { path: '/api/cron/fx',     schedule: '30 15 * * 1-5' },
    { path: '/api/cron/quotes', schedule: '0 21 * * 1-5' },
  ],
};
