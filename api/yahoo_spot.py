"""
Yahoo Finance spot-quote proxy, run as a Vercel Python serverless function.

We call this from the Node.js cron when Stooq lacks the user's actual
exchange listing (today: just IEMM held on Euronext Amsterdam in EUR;
Stooq only carries the LSE GBP twin under EIMI). Direct fetches against
Yahoo's chart endpoint from Vercel's IPs get 429'd within seconds; the
`yfinance` library handles the cookie + crumb session Yahoo expects from
real clients, which lifts the rate limit enough for our daily-cron
volume.

Auth: Bearer ${CRON_SECRET}. Query: ?symbol=<internal>[,<internal>...].
Returns: { quotes: [{symbol,date,close,currency}], errors: [{symbol,error}] }.
"""

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse


# Internal canonical ticker → Yahoo exchange-suffixed symbol. Mirrors
# src/lib/quotes/symbol-map.ts for the entries we actually route here.
SYMBOL_MAP = {
    "IEMM": "IEMM.AS",  # iShares MSCI EM UCITS — Amsterdam EUR class
}


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if not self._authed():
            self._json(401, {"error": "unauthorized"})
            return

        symbols = self._parse_symbols()
        if not symbols:
            self._json(400, {"error": "missing symbol query param"})
            return

        try:
            import yfinance as yf
        except Exception as e:  # noqa: BLE001
            self._json(500, {"error": f"yfinance_import_failed: {e}"})
            return

        quotes = []
        errors = []
        for internal in symbols:
            yahoo_symbol = SYMBOL_MAP.get(internal, internal)
            try:
                ticker = yf.Ticker(yahoo_symbol)
                hist = ticker.history(period="5d", auto_adjust=False)
                if hist.empty:
                    errors.append({"symbol": internal, "error": "no_data"})
                    continue
                last_row = hist.iloc[-1]
                last_date = hist.index[-1].strftime("%Y-%m-%d")
                try:
                    currency = ticker.fast_info["currency"] or "EUR"
                except Exception:  # noqa: BLE001
                    currency = "EUR"
                quotes.append(
                    {
                        "symbol": internal,
                        "date": last_date,
                        "close": f"{float(last_row['Close']):.6f}",
                        "currency": currency,
                    }
                )
            except Exception as e:  # noqa: BLE001
                errors.append(
                    {"symbol": internal, "error": f"{type(e).__name__}: {e}"}
                )

        self._json(200, {"quotes": quotes, "errors": errors})

    def _authed(self) -> bool:
        auth = self.headers.get("Authorization", "")
        secret = os.environ.get("CRON_SECRET", "")
        return bool(secret) and auth == f"Bearer {secret}"

    def _parse_symbols(self) -> list[str]:
        qs = parse_qs(urlparse(self.path).query)
        raw = qs.get("symbol", [""])[0]
        return [s.strip() for s in raw.split(",") if s.strip()]

    def _json(self, status: int, body: dict) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
