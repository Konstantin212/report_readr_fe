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

## History backfill (one-shot, then occasional)

The Performance page needs daily price history to draw the equity curve,
benchmark line, monthly heatmap, etc. On Vercel that path tries Yahoo —
which is blocked at the egress IP — so `quote_history` stays empty and
all the Performance metrics render as zero or `—`.

`scripts/refresh_history.py` fixes that:

```bash
$env:CRON_SECRET = "<paste-CRON_SECRET-from-Vercel>"
# Backfill 2 years of daily closes for every held symbol + S&P 500 benchmark.
python scripts/refresh_history.py --include-benchmark
```

Typical first-run output:

```
-> https://report-readr-fe.vercel.app/api/admin/history-state
   0 rows total · 22 held symbol(s)
     COIN     rows=   0  latest=—
     TSM      rows=   0  latest=—
     …
   fetching COIN (COIN) period=2y ... 502 rows
   fetching TSM (TSM) period=2y ... 502 rows
   fetching ^GSPC (^GSPC) period=2y ... 502 rows
   …
-> https://report-readr-fe.vercel.app/api/admin/history-upload  (11 000 rows total)
   inserted=11000  duplicates=0  total=11000
```

Refresh `/performance` — equity curve, monthly heatmap, Sharpe / beta /
drawdown should all populate.

Re-runs are idempotent (`(symbol, date)` PK on quote_history). You'd
typically run this once after setup, then occasionally to top up with
the most recent days — e.g. once a week or after a long holiday.

Use `--period 5y` for a longer window or `--only SYM SYM` to refresh
just specific tickers.

## Scheduling (optional)

If you'd like the script to run automatically:

- **macOS / Linux**: add to crontab, e.g. `0 22 * * 1-5 /usr/bin/python3 /path/to/scripts/refresh_quotes.py >> /tmp/refresh_quotes.log 2>&1`
- **Windows**: Task Scheduler → daily trigger at 22:00 → action runs `python C:\path\to\scripts\refresh_quotes.py` with `CRON_SECRET` set via the task's environment variables.

The script is idempotent — re-running just re-fetches and overwrites.
