# Out-of-band quote refresh

Some symbols can't be fetched by the Vercel daily cron:

- Yahoo blocks Vercel's egress IP range (returns `no_data` or 429).
- Stooq only carries a different-currency listing (e.g. `EIMI.uk` in GBP
  when our holding is `IEMM.AS` in EUR).

For those, this script runs on a **residential-IP machine** (your laptop)
where Yahoo answers normally, pulls the missing prices, and pushes them
back to the deployment via `POST /api/admin/quote-upload`.

The set of symbols Vercel skips is `EXTERNALLY_PRICED_SYMBOLS` in
`src/lib/quotes/externally-priced.ts`. Add new entries there + a Yahoo
mapping in `scripts/refresh_quotes.py → YAHOO_MAP` when needed.

## One-time setup

```bash
python -m pip install --user yfinance requests
```

## Each run

```bash
# Powershell on Windows:
$env:CRON_SECRET = "<paste-CRON_SECRET-from-Vercel>"
python scripts/refresh_quotes.py

# bash/zsh:
export CRON_SECRET=<paste-CRON_SECRET-from-Vercel>
python scripts/refresh_quotes.py
```

Typical output:

```
-> https://report-readr-fe.vercel.app/api/admin/positions-needing-quotes
   1 symbol(s) need quotes: ['IEMM']
   fetching IEMM (IEMM.AS) ... 55.380000 EUR (2026-05-19)
-> https://report-readr-fe.vercel.app/api/admin/quote-upload  (1 quote(s))
   server response: {'inserted': 1, 'symbols': ['IEMM']}
```

The quote lands in `quote_cache` the same way Stooq's cron writes — so
the Positions page picks it up on the next page load, with the correct
EUR price and EUR-class P/L matching IBKR within rounding.

## Scheduling (optional)

If you'd like the script to run automatically:

- **macOS / Linux**: add to crontab, e.g. `0 22 * * 1-5 /usr/bin/python3 /path/to/scripts/refresh_quotes.py >> /tmp/refresh_quotes.log 2>&1`
- **Windows**: Task Scheduler → daily trigger at 22:00 → action runs `python C:\path\to\scripts\refresh_quotes.py` with `CRON_SECRET` set via the task's environment variables.

The script is idempotent — re-running just re-fetches and overwrites.
