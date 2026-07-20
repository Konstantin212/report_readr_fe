import { DataTable } from "report-readr-fe";
import { Frame } from "./_frame";

type Position = {
  ticker: string;
  name: string;
  broker: string;
  qty: string;
  value: string;
  pl: string;
  up: boolean;
};

const POSITIONS: Position[] = [
  { ticker: "META", name: "Meta Platforms", broker: "FF", qty: "1", value: "568,53", pl: "+404,42", up: true },
  { ticker: "SCHD", name: "Schwab US Dividend", broker: "FF", qty: "105", value: "2 464,84", pl: "+55,10", up: true },
  { ticker: "VUSA", name: "Vanguard S&P 500", broker: "IBKR", qty: "18", value: "1 842,10", pl: "+128,66", up: true },
  { ticker: "ZIM", name: "ZIM Integrated", broker: "FF", qty: "59", value: "765,79", pl: "−331,73", up: false },
  { ticker: "ENPH", name: "Enphase Energy", broker: "IBKR", qty: "5,74", value: "173,00", pl: "−387,64", up: false },
];

const columns = [
  {
    key: "ticker",
    label: "Instrument",
    gridCol: "1.6fr",
    cell: (r: Position) => (
      <div className="min-w-0">
        <div className="font-mono text-[12px] text-ink">{r.ticker}</div>
        <div className="text-[11px] text-muted truncate">{r.name}</div>
      </div>
    ),
  },
  {
    key: "broker",
    label: "Broker",
    gridCol: "0.6fr",
    cell: (r: Position) => (
      <span className="font-mono text-[11px] text-dim">{r.broker}</span>
    ),
  },
  {
    key: "qty",
    label: "Qty",
    gridCol: "0.5fr",
    align: "right" as const,
    cell: (r: Position) => (
      <span className="font-mono text-[12px] text-muted num">{r.qty}</span>
    ),
  },
  {
    key: "value",
    label: "Value",
    gridCol: "0.8fr",
    align: "right" as const,
    cell: (r: Position) => (
      <span className="font-mono text-[12px] text-ink num">€{r.value}</span>
    ),
  },
  {
    key: "pl",
    label: "P/L",
    gridCol: "0.8fr",
    align: "right" as const,
    cell: (r: Position) => (
      <span className={`font-mono text-[12px] num ${r.up ? "text-mint" : "text-bad"}`}>
        {r.pl}
      </span>
    ),
  },
];

function mobileCard(r: Position) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <div className="min-w-0">
        <div className="font-mono text-[12px] text-ink">{r.ticker}</div>
        <div className="text-[11px] text-muted truncate">
          {r.name} · {r.broker}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono text-[12px] text-ink num">€{r.value}</div>
        <div className={`font-mono text-[11px] num ${r.up ? "text-mint" : "text-bad"}`}>
          {r.pl}
        </div>
      </div>
    </div>
  );
}

/** The canonical use: a titled holdings table with a summary row. */
export function Holdings() {
  return (
    <Frame>
      <DataTable<Position>
        title="Holdings"
        meta="5 positions · 2 brokers"
        columns={columns}
        rows={POSITIONS}
        rowKey={(r) => r.ticker}
        renderMobileCard={mobileCard}
        summary={{
          desktopCells: [
            <span key="l" className="font-mono text-[11px] uppercase tracking-widest text-dim">
              Total
            </span>,
            null,
            null,
            <span key="v" className="font-mono text-[12px] text-ink num">€5 814,26</span>,
            <span key="p" className="font-mono text-[12px] text-mint num">−131,19</span>,
          ],
          mobileLabel: "Total",
          mobileBody: (
            <div className="flex justify-between">
              <span className="font-mono text-[12px] text-ink num">€5 814,26</span>
              <span className="font-mono text-[12px] text-bad num">−131,19</span>
            </div>
          ),
        }}
      />
    </Frame>
  );
}

/** Without a header or summary — the bare rows treatment. */
export function Bare() {
  return (
    <Frame>
      <DataTable<Position>
        columns={columns}
        rows={POSITIONS.slice(0, 3)}
        rowKey={(r) => r.ticker}
        renderMobileCard={mobileCard}
      />
    </Frame>
  );
}

/** The empty state, with a footnote in the footer slot. */
export function Empty() {
  return (
    <Frame>
      <DataTable<Position>
        title="Realised gains"
        meta="Steuerjahr 2025"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.ticker}
        renderMobileCard={mobileCard}
        emptyMessage="No disposals in this tax year."
        footer="Aktien losses only offset Aktien gains (§20 Abs. 6 S. 4 EStG)."
      />
    </Frame>
  );
}
