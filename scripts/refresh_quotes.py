"""
Refresh quotes for symbols the Vercel daily cron can't price.

Runs on a residential-IP machine where Yahoo doesn't block us. Pulls the
list of symbols-needing-quotes from the deployment, fetches each one via
yfinance, and pushes the results back to /api/admin/quote-upload.

Usage:
    pip install yfinance requests
    export VERCEL_BASE=https://report-readr-fe.vercel.app    # default
    export CRON_SECRET=<your-CRON_SECRET-from-Vercel>
    python scripts/refresh_quotes.py

Idempotent — re-running just re-fetches and overwrites. Safe to run
daily, hourly, or on-demand from a cron / Task Scheduler entry.
"""

import json
import os
import sys
import time
from typing import Optional

import requests
import yfinance as yf


# Internal canonical ticker → Yahoo exchange-suffixed symbol.
# Mirrors the entries in src/lib/quotes/externally-priced.ts.
YAHOO_MAP: dict[str, str] = {
    "IEMM": "IEMM.AS",  # iShares MSCI EM UCITS — Amsterdam EUR class
}


def fetch_quote(internal_symbol: str) -> Optional[dict]:
    """Return a {symbol, date, close, currency} dict or None on failure."""
    yahoo_symbol = YAHOO_MAP.get(internal_symbol, internal_symbol)
    try:
        ticker = yf.Ticker(yahoo_symbol)
        hist = ticker.history(period="5d", auto_adjust=False)
        if hist.empty:
            return None
        last = hist.iloc[-1]
        date = hist.index[-1].strftime("%Y-%m-%d")
        try:
            currency = ticker.fast_info["currency"] or "EUR"
        except Exception:
            currency = "EUR"
        return {
            "symbol": internal_symbol,
            "date": date,
            "close": f"{float(last['Close']):.6f}",
            "currency": currency,
        }
    except Exception as e:
        print(f"  fetch_quote({internal_symbol}) failed: {type(e).__name__}: {e}", file=sys.stderr)
        return None


def main() -> int:
    base = os.environ.get("VERCEL_BASE", "https://report-readr-fe.vercel.app")
    secret = os.environ.get("CRON_SECRET")
    if not secret:
        print("error: CRON_SECRET env var not set", file=sys.stderr)
        return 1
    headers = {"Authorization": f"Bearer {secret}"}

    print(f"-> {base}/api/admin/positions-needing-quotes")
    r = requests.get(f"{base}/api/admin/positions-needing-quotes", headers=headers, timeout=30)
    r.raise_for_status()
    needed = r.json()["symbols"]
    print(f"   {len(needed)} symbol(s) need quotes: {[s['symbol'] for s in needed]}")
    if not needed:
        print("   nothing to do.")
        return 0

    quotes = []
    for entry in needed:
        sym = entry["symbol"]
        print(f"   fetching {sym} ({YAHOO_MAP.get(sym, sym)}) ...", end=" ")
        q = fetch_quote(sym)
        if q is None:
            print("MISS")
            continue
        print(f"{q['close']} {q['currency']} ({q['date']})")
        quotes.append(q)
        time.sleep(0.3)  # be polite to Yahoo

    if not quotes:
        print("no quotes fetched — exiting without upload.")
        return 2

    print(f"-> {base}/api/admin/quote-upload  ({len(quotes)} quote(s))")
    r = requests.post(
        f"{base}/api/admin/quote-upload",
        headers={**headers, "Content-Type": "application/json"},
        data=json.dumps({"quotes": quotes}),
        timeout=30,
    )
    r.raise_for_status()
    print(f"   server response: {r.json()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
