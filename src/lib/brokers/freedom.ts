import {
  absoluteNumber,
  cleanNumber,
  cleanString,
  compactEvent,
  dateOnly,
  decodeBytes,
  negateNumber,
  parsePositiveAmount,
  signedQuantity,
  subtractNumbers,
} from "./format";
import type { BrokerAccountMetadata, NormalizedEvent, ParsedBrokerStatement, SnapshotQuote } from "./types";

/**
 * Freedom Finance / Freedom24 statement parser.
 *
 * Two formats coexist in the wild:
 *
 * - **Legacy (Freedom Finance, pre-2024)**: per-transaction rows live in
 *   `cash_flows.detailed`, `commissions.detailed`, `corporate_actions.detailed`.
 *   Field names use the broker's internal short codes (`curr_c`, `summ`,
 *   `short_date`, `instr_nm`, …).
 *
 * - **Current (Freedom24, post-rebrand)**: those same arrays still exist but
 *   contain GROUPED summary rows where almost every field is the string
 *   `"Grouped"`. The real per-transaction data is now in:
 *     `cash_in_outs`           — deposits, withdrawals, dividends, taxes, fees
 *     `securities_in_outs`     — corporate actions (splits, conversions, transfers)
 *   …with completely different field names (`amount`, `datetime`, `currency`,
 *   `type`, `ticker`).
 *
 * Trades carry the same shape in both formats and use the existing field
 * names verbatim, so `parseTrades` is unchanged.
 *
 * The parser uses the new arrays when populated; the old `*.detailed`
 * arrays are still consulted for older files. Grouped sentinel rows are
 * filtered out (their `date` field returns the empty string via
 * `dateOnly`, and we drop empty-date events at the end of every section).
 */

type FreedomStatement = {
  date_start?: unknown;
  date_end?: unknown;
  plainAccountInfoData?: {
    account?: unknown;
    account_id?: unknown;
    /** The stable Freedom24 account identifier — what the user sees as
     *  their client number. Older statements only carried `account` or
     *  `account_id`, but mid-2025+ files put it under `client_code`. */
    client_code?: unknown;
    currency?: unknown;
    base_currency?: unknown;
  };
  accountInfo?: {
    account?: unknown;
    account_id?: unknown;
    currency?: unknown;
  };
  trades?: { detailed?: FreedomTrade[] };
  cash_flows?: { detailed?: FreedomCashFlow[] };
  cash_in_outs?: FreedomCashInOut[];
  commissions?: { detailed?: FreedomCommission[] };
  corporate_actions?: { detailed?: FreedomCorporateAction[] };
  securities_in_outs?: FreedomSecurityInOut[];
  // Statement-end position snapshot. We use mkt_price per row to seed
  // quote_cache for symbols our free quote providers can't reach
  // (UCITS ETFs on Amsterdam / Frankfurt, Freedom-specific aliases
  // like RY4C, etc.). One entry per currently-held position.
  account_at_end?: {
    account?: {
      positions_from_ts?: {
        ps?: {
          pos?: Array<{
            i?: unknown;            // ticker with FF exchange suffix, e.g. "VHYL.EU"
            issue_nb?: unknown;     // ISIN — matched against trade `isin` to re-key alias mismatches
            mkt_price?: unknown;    // close in `curr`
            curr?: unknown;         // native currency, e.g. "USD" / "EUR"
            q?: unknown;            // quantity (sanity-check only)
          }>;
        };
      };
    };
  };
  /**
   * Per-currency cash summary including `curr_at_end` — FF's authoritative
   * ending balance for each currency at date_end. Used to seed the cash
   * card with a snapshot instead of summing 700+ historical events, the
   * same way IBKR's "Ending Settled Cash" row in the Cash Report is used.
   */
  cash_flows_json?: Array<{
    curr?: unknown;            // currency code, e.g. "USD" / "EUR" / "RUR"
    curr_at_end?: unknown;     // ending balance in `curr`
  }>;
};

type FreedomTrade = Record<string, unknown> & {
  id?: unknown;
  date?: unknown;
  short_date?: unknown;
  instr_nm?: unknown;
  isin?: unknown;
  operation?: unknown;
  curr_c?: unknown;
  q?: unknown;
  p?: unknown;
  summ?: unknown;
  profit?: unknown;
  commission?: unknown;
  commission_currency?: unknown;
  /** Broker-declared instrument kind, Russian free text, e.g.
   *  "акция обыкновенная" (common stock), "фонд/ETF", "депозитарная расписка". */
  instr_kind?: unknown;
  /** String variant of the numeric `instr_type`, when the export carries it. */
  instr_type_c?: unknown;
};

type FreedomCashFlow = Record<string, unknown> & {
  id?: unknown;
  date?: unknown;
  short_date?: unknown;
  instr_nm?: unknown;
  operation?: unknown;
  curr_c?: unknown;
  summ?: unknown;
  withholding_tax?: unknown;
};

type FreedomCashInOut = Record<string, unknown> & {
  id?: unknown;
  currency?: unknown;
  type?: unknown;
  datetime?: unknown;
  pay_d?: unknown;
  amount?: unknown;
  commission?: unknown;
  ticker?: unknown;
  comment?: unknown;
  corporate_action_id?: unknown;
};

type FreedomCommission = Record<string, unknown> & {
  id?: unknown;
  date?: unknown;
  short_date?: unknown;
  datetime?: unknown;
  curr_c?: unknown;
  currency?: unknown;
  summ?: unknown;
  sum?: unknown;
};

type FreedomCorporateAction = Record<string, unknown> & {
  id?: unknown;
  date?: unknown;
  short_date?: unknown;
  instr_nm?: unknown;
  ticker?: unknown;
  isin?: unknown;
  operation?: unknown;
  type?: unknown;
  curr_c?: unknown;
  currency?: unknown;
  q?: unknown;
  quantity?: unknown;
  summ?: unknown;
  amount?: unknown;
};

type FreedomSecurityInOut = Record<string, unknown> & {
  id?: unknown;
  ticker?: unknown;
  type?: unknown;
  datetime?: unknown;
  pay_d?: unknown;
  quantity?: unknown;
  commission?: unknown;
  commission_currency?: unknown;
  balance_currency?: unknown;
  cost?: unknown;
  market_value?: unknown;
  comment?: unknown;
};

export function parseFreedomFinanceStatement(
  fileName: string,
  bytes: Uint8Array | ArrayBuffer,
  taxYear: number,
): ParsedBrokerStatement {
  const statement = JSON.parse(decodeBytes(bytes)) as FreedomStatement;
  // Union the two account-info shapes; only one is present in any
  // given statement. Cast to a permissive record so we can read every
  // historically-used key (client_code, account, account_id, …) without
  // having to introspect which schema variant we got.
  const accountInfo = (statement.plainAccountInfoData ?? statement.accountInfo ?? {}) as Record<string, unknown>;
  // Account number priority: client_code (current FF schema) → account
  // → account_id (legacy keys) → filename (last-resort, NOT stable
  // across re-uploads of differently-dated periods, which historically
  // created a duplicate broker_account on every fresh export).
  const accountNumber =
    cleanString(accountInfo.client_code) ??
    cleanString(accountInfo.account) ??
    cleanString(accountInfo.account_id) ??
    fileName.replace(/\W+/g, "-");

  const account: BrokerAccountMetadata = {
    broker: "FREEDOM_FINANCE",
    accountNumber,
    baseCurrency:
      cleanString(accountInfo.currency) ?? cleanString(accountInfo.base_currency),
    statementStartDate: dateOnly(statement.date_start) || undefined,
    statementEndDate: dateOnly(statement.date_end) || undefined,
    fileName,
    taxYear,
  };

  const events = [
    ...parseTrades(statement.trades?.detailed ?? [], accountNumber),
    // Cash side: prefer the newer per-transaction array when present,
    // fall back to the legacy detailed list otherwise.
    ...parseCashInOuts(statement.cash_in_outs ?? [], accountNumber),
    ...parseCashFlows(statement.cash_flows?.detailed ?? [], accountNumber),
    ...parseCommissions(statement.commissions?.detailed ?? [], accountNumber),
    // Corporate actions: same shape choice as cash.
    ...parseSecuritiesInOuts(statement.securities_in_outs ?? [], accountNumber),
    ...parseCorporateActions(statement.corporate_actions?.detailed ?? [], accountNumber),
    // Authoritative per-currency ending balance snapshot — getCashBalances
    // sees source="CASH_REPORT_ENDING" and skips event-summing for that
    // (account, currency) pair. Mirrors IBKR's Cash Report path.
    ...parseFreedomCashEndings(statement, accountNumber),
  ];

  // Freedom stamps ISIN on TRADE rows but leaves it off DIVIDEND,
  // WITHHOLDING_TAX and CORPORATE_ACTION rows. Backfill the missing ISINs
  // from the symbol→ISIN map built off TRADEs so downstream joins (tax
  // evidence CSV, position grouping) don't have to special-case it — and
  // so replay's split handling finds the ISIN-keyed lots.
  const symbolToIsin = new Map<string, string>();
  for (const ev of events) {
    if (ev.type === "TRADE" && ev.symbol && ev.isin) symbolToIsin.set(ev.symbol, ev.isin);
  }
  for (const ev of events) {
    if (ev.isin || !ev.symbol) continue;
    if (ev.type !== "DIVIDEND" && ev.type !== "WITHHOLDING_TAX" && ev.type !== "CORPORATE_ACTION") continue;
    const isin = symbolToIsin.get(ev.symbol);
    if (isin) ev.isin = isin;
  }

  // Build an (ISIN → trade symbol) map so the snapshot parser can
  // re-key alias mismatches like Ryanair (FF reports it as `RY4C.EU`
  // in trades but `RYA.EU` in the position snapshot — same company,
  // same ISIN `IE00BYTBXV33`). Without this remap the snapshot quote
  // lands under `RYA`, which nothing in lots or positions references.
  const tradeSymbolByIsin = new Map<string, string>();
  for (const row of statement.trades?.detailed ?? []) {
    const isin = cleanString(row.isin);
    const symbol = stripFreedomSuffix(cleanString(row.instr_nm));
    if (isin && symbol && !tradeSymbolByIsin.has(isin)) {
      tradeSymbolByIsin.set(isin, symbol);
    }
  }

  const snapshotQuotes = parseFreedomSnapshotQuotes(statement, tradeSymbolByIsin);

  return { account, events, snapshotQuotes };
}

/**
 * Extract a spot-quote per currently-held position from the
 * end-of-statement balance dump. Used to seed quote_cache for symbols
 * we can't price via the free API providers — Freedom puts the
 * statement-end mkt_price right there, so re-uploading the file
 * refreshes the price for the European ETFs at the same time.
 *
 * Skips rows with no usable price; the importer happily writes the
 * empty array. Symbols are first stripped of FF's exchange suffix
 * (.EU/.US/etc.) and then cross-referenced against
 * `tradeSymbolByName` so any FF alias mismatch (the Ryanair case
 * above) lands under the same ticker the user's lots use.
 */
function parseFreedomSnapshotQuotes(
  statement: FreedomStatement,
  tradeSymbolByIsin: Map<string, string>,
) {
  const date = dateOnly(cleanString(statement.date_end));
  const rows = statement.account_at_end?.account?.positions_from_ts?.ps?.pos ?? [];
  if (!date || !rows.length) return [];
  const out: SnapshotQuote[] = [];
  for (const r of rows) {
    const rawTicker = cleanString(r.i);
    const stripped = stripFreedomSuffix(rawTicker);
    if (!stripped) continue;
    const num = parsePositiveAmount(cleanNumber(r.mkt_price));
    if (num === null) continue;
    const currency = cleanString(r.curr) ?? "USD";
    // If the same company appears under a different ticker in trades
    // (snapshot says RYA, trades say RY4C — same ISIN), re-key the
    // snapshot to the trade ticker so the quote lands where lots and
    // positions actually look for it.
    const isin = cleanString(r.issue_nb);
    const remapped = isin ? tradeSymbolByIsin.get(isin) : undefined;
    const symbol = remapped ?? stripped;
    out.push({ symbol, date, close: num.toFixed(2), currency, source: "FREEDOM_SNAPSHOT" });
  }
  return out;
}

/**
 * Capture Freedom's authoritative per-currency ending balance from the
 * top-level `cash_flows_json` array. Each entry has `curr` (currency code
 * like "USD" / "EUR") and `curr_at_end` (ending balance in that currency).
 *
 * Emitted as CASH_TRANSFER events with source="CASH_REPORT_ENDING" so the
 * cash accessor in src/lib/data/cash.ts recognises them as snapshots and
 * bypasses event-summing for those currencies. Without this we'd sum
 * 700+ historical cash flows + commissions + trades, which silently
 * overstates the balance whenever any sign is wrong or an old
 * withdrawal didn't make it into the latest export.
 *
 * Skips currencies with a zero / missing ending balance — the snapshot
 * is then absent for those currencies and the existing event-sum path
 * handles them (which for zero-balance currencies will produce no row).
 */
function parseFreedomCashEndings(
  statement: FreedomStatement,
  accountNumber: string,
): NormalizedEvent[] {
  const date = dateOnly(cleanString(statement.date_end));
  const rows = statement.cash_flows_json ?? [];
  if (!date || !rows.length) return [];
  const out: NormalizedEvent[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const currency = cleanString(r.curr);
    const endStr = cleanNumber(r.curr_at_end);
    if (!currency || !endStr) continue;
    const num = Number(endStr);
    if (!Number.isFinite(num)) continue;
    out.push(compactEvent<NormalizedEvent>({
      id: `ff-cash-snapshot-${i + 1}`,
      broker: "FREEDOM_FINANCE",
      accountNumber,
      type: "CASH_TRANSFER",
      date,
      currency,
      description: "Ending balance",
      amount: endStr,
      cashAmount: endStr,
      source: "CASH_REPORT_ENDING",
    }));
  }
  return out;
}

/**
 * Strip a Freedom exchange suffix like `.US` / `.EU` / `.RU` / `.HK` from
 * a stock ticker so the symbol aligns with the canonical form used by
 * the IBKR parser and by the Stooq quote lookup. FX pairs (with a `/`)
 * and benchmark indices (with a `^`) are returned untouched.
 */
function stripFreedomSuffix(symbol: string | undefined): string | undefined {
  if (!symbol) return undefined;
  if (symbol.includes("/") || symbol.startsWith("^")) return symbol;
  return symbol.replace(/\.(US|EU|RU|HK|UK|DE|FR|NL|IT|CH|JP|CA|AU)$/i, "");
}

/**
 * Map Freedom's broker-declared instrument kind (`instr_kind`, Russian
 * free text) to our normalized asset kind. Verified real values:
 *   "акция обыкновенная"      (common stock)          → "stock"
 *   "фонд/ETF"                (fund/ETF)              → "etf"
 *   "депозитарная расписка"   (depositary receipt/ADR) → "stock"
 *   "валюта"                  (currency — FX rows)    → not a TRADE, ignored
 *
 * Matching is substring-based and case-insensitive so wording variants
 * still resolve. Unknown non-empty values return `undefined` (NOT "other")
 * so downstream classification can fall back to the hardcoded maps rather
 * than being pinned to a wrong kind.
 */
export function mapFreedomInstrKind(
  raw: string | undefined,
): "stock" | "etf" | "bond" | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (s.includes("облигаци")) return "bond";
  if (s.includes("фонд") || s.includes("etf")) return "etf";
  if (s.includes("акци") || s.includes("расписк")) return "stock";
  return undefined;
}

/**
 * Sign the trade amount based on the operation, regardless of the broker's
 * own sign convention. Freedom24 exports `summ` as the *absolute* total of
 * the trade; older Freedom Finance reports sometimes already sign it
 * (negative on buys). This helper normalises both: a buy ALWAYS yields a
 * negative cash impact and a sell ALWAYS yields a positive one.
 */
function signTradeAmount(amount: string | undefined, operation: string | undefined): string | undefined {
  if (amount === undefined) return undefined;
  const num = Number(amount);
  if (!Number.isFinite(num)) return amount;
  const op = String(operation ?? "").toLowerCase();
  const isSell = op.includes("sell") || op.includes("sale") || op.includes("sold");
  return (isSell ? Math.abs(num) : -Math.abs(num)).toString();
}

const FX_PAIR_RE = /^[A-Z]{3,4}\/[A-Z]{3,4}$/;

function parseTrades(rows: FreedomTrade[], accountNumber: string): NormalizedEvent[] {
  return rows
    .flatMap<NormalizedEvent>((row, index) => {
      const date = dateOnly(cleanString(row.short_date) ?? cleanString(row.date));
      if (!date) return [];
      const operation = cleanString(row.operation);
      const rawSymbol = cleanString(row.instr_nm);

      // FX pair conversions (RUR/USD, EUR/USD, USD/EUR, …) are not stock
      // trades. Emit them as two FX_CONVERSION legs — one per currency —
      // so the cash totals net cleanly and no phantom symbol creeps into
      // the positions table.
      if (rawSymbol && FX_PAIR_RE.test(rawSymbol)) {
        return parseForexTrade(row, index, accountNumber, date, rawSymbol, operation);
      }

      const symbol = stripFreedomSuffix(rawSymbol);
      const quantity = signedQuantity(row.q, operation);
      const fee = absoluteNumber(row.commission);
      const signedAmount = signTradeAmount(cleanNumber(row.summ), operation);
      const tradeCurrency = cleanString(row.curr_c) ?? "UNKNOWN";
      const feeCurrency = cleanString(row.commission_currency);
      // The fee can be in a different currency than the trade (Freedom
      // bills commissions in the account base currency, usually EUR,
      // while the trade is USD). When the two differ, rolling fee into
      // cashAmount would mix currencies in a single native field —
      // keep cashAmount = signedAmount and let the FX layer derive the
      // combined cashAmountEur from amountEur + feeEur.
      const sameCurrencyFee = !feeCurrency || feeCurrency === tradeCurrency;
      const cashAmount = sameCurrencyFee ? subtractNumbers(signedAmount, fee) : signedAmount;

      return [withTaxReview(compactEvent<NormalizedEvent>({
        id: cleanString(row.id) ?? `freedom-trade-${index + 1}`,
        broker: "FREEDOM_FINANCE",
        accountNumber,
        type: "TRADE",
        date,
        currency: tradeCurrency,
        symbol,
        isin: cleanString(row.isin),
        description: operation,
        instrumentKind: mapFreedomInstrKind(cleanString(row.instr_type_c) ?? cleanString(row.instr_kind)),
        quantity,
        price: cleanNumber(row.p),
        amount: signedAmount,
        cashAmount,
        proceeds: signedAmount,
        realizedPnl: cleanNumber(row.profit),
        fee,
        feeCurrency: sameCurrencyFee ? undefined : feeCurrency,
        source: "trades.detailed",
      }))];
    });
}

/**
 * Split a Freedom FX-pair row (e.g. RUR/USD buy q=4100 summ=56.54 in USD)
 * into the two FX_CONVERSION legs the ledger expects:
 *   base leg:  +q     in <base ccy>   (received) on buy / negated on sell
 *   quote leg: -summ  in <quote ccy>  (paid)     on buy / sign-flipped on sell
 *
 * Per Freedom's convention, `q` is the absolute quantity of the base
 * currency and `summ` is the absolute amount of the quote currency. The
 * `operation` field tells us which direction. There is never a stock
 * symbol on these rows, so no position can be created from them.
 */
function parseForexTrade(
  row: FreedomTrade,
  index: number,
  accountNumber: string,
  date: string,
  pair: string,
  operation: string | undefined,
): NormalizedEvent[] {
  const [base, quote] = pair.split("/");
  const op = String(operation ?? "").toLowerCase();
  const isSell = op.includes("sell") || op.includes("sale") || op.includes("sold");
  const q = Number(cleanNumber(row.q) ?? "0");
  const summ = Number(cleanNumber(row.summ) ?? "0");
  if (!Number.isFinite(q) || !Number.isFinite(summ)) return [];
  // Direction: buy of "BASE/QUOTE" means +base, -quote. sell flips both.
  const baseAmount = (isSell ? -1 : 1) * Math.abs(q);
  const quoteAmount = (isSell ? 1 : -1) * Math.abs(summ);
  const baseLeg = compactEvent<NormalizedEvent>({
    id: `${cleanString(row.id) ?? `freedom-fx-${index + 1}`}-base`,
    broker: "FREEDOM_FINANCE",
    accountNumber,
    type: "FX_CONVERSION",
    date,
    currency: base,
    description: pair,
    amount: baseAmount.toString(),
    cashAmount: baseAmount.toString(),
    source: "trades.detailed",
  });
  const quoteLeg = compactEvent<NormalizedEvent>({
    id: `${cleanString(row.id) ?? `freedom-fx-${index + 1}`}-quote`,
    broker: "FREEDOM_FINANCE",
    accountNumber,
    type: "FX_CONVERSION",
    date,
    currency: quote,
    description: pair,
    amount: quoteAmount.toString(),
    cashAmount: quoteAmount.toString(),
    source: "trades.detailed",
  });
  return [baseLeg, quoteLeg];
}

/**
 * Freedom24 `cash_in_outs` — the per-transaction record of every cash
 * movement on the account. The `type` field is a small enum: `card`,
 * `bank`, `intercompany` for deposits/withdrawals; `dividend` for paid
 * dividends; `tax` for tax-only flows; `dividend_reverted` / `tax_reverted`
 * for unwinds; `block` / `unblock` / `block_commission` /
 * `unblock_commission` for margin-collateral handling.
 *
 * We bucket those into our domain event types as follows:
 *   card / bank / intercompany / unblock / block                     → CASH_TRANSFER
 *   dividend / dividend_reverted                                      → DIVIDEND
 *   tax / tax_reverted                                                → WITHHOLDING_TAX
 *   block_commission / unblock_commission                             → FEE
 */
function parseCashInOuts(rows: FreedomCashInOut[], accountNumber: string): NormalizedEvent[] {
  return rows
    .map((row, index) => {
      const date = dateOnly(cleanString(row.datetime) ?? cleanString(row.pay_d));
      if (!date) return null;
      const type = cleanString(row.type)?.toLowerCase() ?? "";
      const amount = cleanNumber(row.amount);
      const eventType: NormalizedEvent["type"] = classifyCashInOut(type);
      const isReversal = type.endsWith("_reverted");
      // Reversals flip the sign so cash math nets cleanly.
      const cashAmount = isReversal && amount !== undefined ? negateNumber(amount) : amount;
      const wht =
        eventType === "WITHHOLDING_TAX" ? absoluteNumber(amount) : undefined;

      return withTaxReview(compactEvent<NormalizedEvent>({
        id: cleanString(row.id) ?? `freedom-cash-in-out-${index + 1}`,
        broker: "FREEDOM_FINANCE",
        accountNumber,
        type: eventType,
        date,
        currency: cleanString(row.currency) ?? "UNKNOWN",
        symbol: stripFreedomSuffix(cleanString(row.ticker)),
        description: cleanString(row.comment) ?? cleanString(row.type),
        amount: isReversal ? negateNumber(amount) : amount,
        cashAmount,
        withholdingTax: wht,
        fee: cleanNumber(row.commission),
        source: "cash_in_outs",
      }));
    })
    .filter((event): event is NormalizedEvent => Boolean(event));
}

function classifyCashInOut(type: string): NormalizedEvent["type"] {
  if (type.startsWith("dividend")) return "DIVIDEND";
  if (type.startsWith("tax")) return "WITHHOLDING_TAX";
  if (type === "block_commission" || type === "unblock_commission") return "FEE";
  return "CASH_TRANSFER";
}

function parseCashFlows(rows: FreedomCashFlow[], accountNumber: string): NormalizedEvent[] {
  return rows
    .map((row, index) => {
      const date = dateOnly(cleanString(row.short_date) ?? cleanString(row.date));
      if (!date) return null;
      const operation = cleanString(row.operation)?.toLowerCase() ?? "";
      const eventType = operation.includes("dividend") ? "DIVIDEND" : "CASH_TRANSFER";
      const amount = cleanNumber(row.summ);
      const withholdingTax = absoluteNumber(row.withholding_tax);

      return withTaxReview(compactEvent<NormalizedEvent>({
        id: cleanString(row.id) ?? `freedom-cash-flow-${index + 1}`,
        broker: "FREEDOM_FINANCE",
        accountNumber,
        type: eventType,
        date,
        currency: cleanString(row.curr_c) ?? "UNKNOWN",
        symbol: stripFreedomSuffix(cleanString(row.instr_nm)),
        description: cleanString(row.operation) ?? cleanString(row.instr_nm),
        amount,
        cashAmount: eventType === "DIVIDEND" ? subtractNumbers(amount, withholdingTax) : amount,
        withholdingTax,
        source: "cash_flows.detailed",
      }));
    })
    .filter((event): event is NormalizedEvent => Boolean(event));
}

function parseCommissions(rows: FreedomCommission[], accountNumber: string): NormalizedEvent[] {
  return rows
    .map((row, index) => {
      const date = dateOnly(
        cleanString(row.short_date) ?? cleanString(row.date) ?? cleanString(row.datetime),
      );
      if (!date) return null;
      const amount = cleanNumber(row.summ) ?? cleanNumber(row.sum);
      return withTaxReview(compactEvent<NormalizedEvent>({
        id: cleanString(row.id) ?? `freedom-fee-${index + 1}`,
        broker: "FREEDOM_FINANCE",
        accountNumber,
        type: "FEE",
        date,
        currency: cleanString(row.curr_c) ?? cleanString(row.currency) ?? "UNKNOWN",
        amount,
        fee: absoluteNumber(amount),
        cashAmount: negateNumber(absoluteNumber(amount)),
        source: "commissions.detailed",
      }));
    })
    .filter((event): event is NormalizedEvent => Boolean(event));
}

/**
 * Freedom24 `securities_in_outs` — per-row corporate-action effects on
 * security balances. Splits, conversions, transfers in/out all land here
 * with `quantity` reflecting the share delta (positive when shares come
 * in, negative when they go out). We surface the raw event so the FIFO
 * replayer can decide how to handle it; v1 just stores them, v2 will
 * re-base lots when a split factor is detected in the comment.
 */
function parseSecuritiesInOuts(rows: FreedomSecurityInOut[], accountNumber: string): NormalizedEvent[] {
  return rows
    .map((row, index) => {
      const date = dateOnly(cleanString(row.datetime) ?? cleanString(row.pay_d));
      if (!date) return null;
      // Splits / transfers / conversions affect share counts, not cash.
      // We deliberately omit `amount` and `cashAmount` so the cash
      // accessor doesn't sum the (informational) market_value as a
      // phantom cash flow that never happened.
      return compactEvent<NormalizedEvent>({
        id: cleanString(row.id) ?? `freedom-security-in-out-${index + 1}`,
        broker: "FREEDOM_FINANCE",
        accountNumber,
        type: "CORPORATE_ACTION",
        date,
        currency: cleanString(row.balance_currency) ?? cleanString(row.commission_currency) ?? "UNKNOWN",
        symbol: stripFreedomSuffix(cleanString(row.ticker)),
        description: cleanString(row.type) ?? cleanString(row.comment),
        quantity: cleanNumber(row.quantity),
        source: "securities_in_outs",
      });
    })
    .filter((event): event is NormalizedEvent => Boolean(event));
}

/**
 * Freedom24 restates every dividend a SECOND time in `corporate_actions`
 * with `operation: "Dividends"`, carrying the amount net of withholding —
 * the same payments already parsed from `cash_flows.detailed` as DIVIDEND
 * events (gross, with the withholding on its own row). Reconciling 2025
 * showed €545.39 gross dividends against €487.91 of these restatements, a
 * €57.48 difference matching the €57.46 withholding total.
 *
 * We keep the row as an audit trail but strip its monetary fields, so no
 * consumer can sum the year's dividends twice. Same reasoning — and same
 * treatment — as the informational rows in parseSecuritiesInOuts.
 */
function isDividendRestatement(description: string | undefined): boolean {
  return Boolean(description && /^dividends?$/i.test(description.trim()));
}

function parseCorporateActions(rows: FreedomCorporateAction[], accountNumber: string): NormalizedEvent[] {
  return rows
    .map((row, index) => {
      const date = dateOnly(cleanString(row.short_date) ?? cleanString(row.date));
      if (!date) return null;
      const description = cleanString(row.operation) ?? cleanString(row.type);
      const restatesDividend = isDividendRestatement(description);
      return compactEvent<NormalizedEvent>({
        id: cleanString(row.id) ?? `freedom-corporate-action-${index + 1}`,
        broker: "FREEDOM_FINANCE",
        accountNumber,
        type: "CORPORATE_ACTION",
        date,
        currency: cleanString(row.curr_c) ?? cleanString(row.currency) ?? "UNKNOWN",
        symbol: stripFreedomSuffix(cleanString(row.instr_nm) ?? cleanString(row.ticker)),
        isin: cleanString(row.isin),
        description,
        quantity: cleanNumber(row.q) ?? cleanNumber(row.quantity),
        amount: restatesDividend ? undefined : cleanNumber(row.summ) ?? cleanNumber(row.amount),
        source: "corporate_actions.detailed",
      });
    })
    .filter((event): event is NormalizedEvent => Boolean(event));
}

function withTaxReview(event: NormalizedEvent): NormalizedEvent {
  if (event.currency === "EUR") {
    return {
      ...event,
      amountEur: event.amount,
      proceedsEur: event.proceeds,
      realizedPnlEur: event.realizedPnl,
      feeEur: event.fee,
      withholdingTaxEur: event.withholdingTax,
      cashAmountEur: event.cashAmount,
      fxSource: "BROKER",
    };
  }

  const needsTaxReview =
    (event.type === "TRADE" && event.realizedPnl !== undefined) ||
    ((event.type === "DIVIDEND" || event.type === "INTEREST") && event.amount !== undefined) ||
    (event.type === "WITHHOLDING_TAX" && (event.withholdingTax !== undefined || event.amount !== undefined));

  return needsTaxReview ? { ...event, fxSource: "MISSING", requiresReview: true } : event;
}
