#!/bin/sh
# Vercel Build Command override (Project Settings → Build Command).
# Applies pending Drizzle migrations before the app that depends on
# them goes live, and only against the real production database —
# preview builds skip straight to `next build`.
set -e

if [ "$VERCEL_ENV" = "production" ]; then
  echo "▶ production build: applying pending migrations"
  pnpm db:migrate
fi

pnpm build
