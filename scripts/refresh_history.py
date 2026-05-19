"""
Backfill daily price history for symbols Vercel can't reach.

Yahoo blocks Vercel's egress IPs at the network layer, so the on-ingest
`backfillHistoryForSymbols` path has never actually written rows to the
`quote_history` table in production — that's why the Performance page
shows an empty equity curve, all metrics at zero, no benchmark line, no
heatmap fills.

This script runs on a residential-IP machine where yfinance works
normally, fetches a multi-year daily history per held symbol, and POSTs
the rows to `/api/admin/history-upload`. Idempotent — the (symbol, date)
primary key on quote_history makes re-runs cheap.

Usage:
    pip install yfinance requests
    $env:CRON_SECRET = "<paste-CRON_SECRET-from-Vercel>"
    python scripts/refresh_history.py
    # ...wait ~30s, then refresh /performance

Period defaults to 2 years — matches the longest range the Performance
page renders today (the "2Y" tab). Override with --period 5y if you want
deeper history.
"""

import argparse
import json
import os
import sys
import time
from typing import Iterable, Optional

import requests
import yfinance as yf


# Internal canonical ticker → Yahoo exchange-suffixed symbol.
# Mirrors src/lib/quotes/symbol-map.ts entries + extends with the FF
# tickers that strip the .US/.EU suffix in our parser. Anything not in
# this map is passed to yfinance verbatim (covers US tickers — AAPL,
# COIN, BLBD, …).
YAHOO_MAP: dict[str, str] = {
    # ETFs / cross-listed instruments where Yahoo wants the exchange suffix.
    "IEMM": "IEMM.AS",
    "VHYL": "VHYL.AS",
    "VUSA": "VUSA.AS",
    "SPYW": "SPYW.DE",
    "XSX7": "XSX7.DE",
    "TRN":  "TRN.L",
    "EVO":  "EVO.ST",
    "RY4C": "RY4C.DE",
    # Common rewrite for Berkshire-style class suffixes.
    "BRK B": "BRK-B",
    # FF stocks come through stripped of .US (handled by the parser).
    # Yahoo accepts the bare ticker for those: TTWO, SPY, O, NET, NEM,
    # HOOD, DIS, C — so no entry needed here.
    # IBKR benchmark — Stooq uses ^spx; Yahoo uses ^GSPC.
    "^GSPC": "^GSPC",
}


def fetch_history(internal_symbol: str, period: str) -> list[dict]:
    """Return a list of {symbol, date, close, currency} rows for one ticker.
    Empty list on any failure — caller logs and moves on."""
    yahoo_sym = YAHOO_MAP.get(internal_symbol, internal_symbol)
    try:
        ticker = yf.Ticker(yahoo_sym)
        hist = ticker.history(period=period, auto_adjust=False)
        if hist.empty:
            print(f"  {internal_symbol} ({yahoo_sym}): no data", file=sys.stderr)
            return []
        try:
            currency = ticker.fast_info["currency"] or "USD"
        except Exception:
            currency = "USD"
        out: list[dict] = []
        for idx, row in hist.iterrows():
            close = row.get("Close")
            if close is None or close != close:  # NaN check
                continue
            out.append(
                {
                    "symbol": internal_symbol,
                    "date": idx.strftime("%Y-%m-%d"),
                    "close": f"{float(close):.6f}",
                    "currency": currency,
                }
            )
        return out
    except Exception as e:  # noqa: BLE001
        print(f"  {internal_symbol} ({yahoo_sym}): {type(e).__name__}: {e}", file=sys.stderr)
        return []


def chunked(rows: list[dict], size: int) -> Iterable[list[dict]]:
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--period", default="2y", help="yfinance period: 1y, 2y, 5y, max")
    parser.add_argument("--include-benchmark", action="store_true",
                        help="Also fetch the ^GSPC benchmark history (needed for the Performance page's S&P 500 line).")
    parser.add_argument("--only", nargs="*", default=None,
                        help="Restrict to these internal symbols (default: every held + benchmark).")
    args = parser.parse_args()

    base = os.environ.get("VERCEL_BASE", "https://report-readr-fe.vercel.app")
    secret = os.environ.get("CRON_SECRET")
    if not secret:
        print("error: CRON_SECRET env var not set", file=sys.stderr)
        return 1
    headers = {"Authorization": f"Bearer {secret}"}

    print(f"-> {base}/api/admin/history-state")
    r = requests.get(f"{base}/api/admin/history-state", headers=headers, timeout=30)
    r.raise_for_status()
    state = r.json()
    held: list[str] = state["held"]
    print(f"   {state['totalHistoryRows']} rows total · {len(held)} held symbol(s)")
    for c in state["coverage"]:
        latest = c["latestDate"] or "—"
        print(f"     {c['symbol']:<8} rows={c['rows']:>4}  latest={latest}")

    if args.include_benchmark and "^GSPC" not in held:
        held.append("^GSPC")
    targets = args.only if args.only else held
    if not targets:
        print("   nothing to fetch.")
        return 0

    all_rows: list[dict] = []
    for sym in targets:
        yahoo_sym = YAHOO_MAP.get(sym, sym)
        print(f"   fetching {sym} ({yahoo_sym}) period={args.period} ...", end=" ", flush=True)
        rows = fetch_history(sym, args.period)
        print(f"{len(rows)} rows")
        all_rows.extend(rows)
        time.sleep(0.5)  # be polite to Yahoo

    if not all_rows:
        print("no rows fetched — exiting without upload.")
        return 2

    print(f"-> {base}/api/admin/history-upload  ({len(all_rows)} rows total)")
    inserted_total = 0
    duplicate_total = 0
    for batch in chunked(all_rows, 500):
        r = requests.post(
            f"{base}/api/admin/history-upload",
            headers={**headers, "Content-Type": "application/json"},
            data=json.dumps({"rows": batch}),
            timeout=60,
        )
        r.raise_for_status()
        resp = r.json()
        inserted_total += resp.get("inserted", 0)
        duplicate_total += resp.get("duplicates", 0)
    print(f"   inserted={inserted_total}  duplicates={duplicate_total}  total={len(all_rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
