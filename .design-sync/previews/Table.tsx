import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "report-readr-fe";
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
  { ticker: "SCHD", name: "Schwab US Dividend", broker: "FF", qty: "105", value: "2 464,84", pl: "+55,10", up: true },
  { ticker: "VUSA", name: "Vanguard S&P 500", broker: "IBKR", qty: "18", value: "1 842,10", pl: "+128,66", up: true },
  { ticker: "ZIM", name: "ZIM Integrated", broker: "FF", qty: "59", value: "765,79", pl: "−331,73", up: false },
  { ticker: "ENPH", name: "Enphase Energy", broker: "IBKR", qty: "5,74", value: "173,00", pl: "−387,64", up: false },
];

/** The canonical use: a plain holdings table, header + body, no footer. */
export function Holdings() {
  return (
    <Frame className="max-w-2xl">
      <Table>
        <TableHeader className="border-border">
          <TableRow className="border-border">
            <TableHead>Instrument</TableHead>
            <TableHead>Broker</TableHead>
            <TableHead className="text-right">Menge</TableHead>
            <TableHead className="text-right">Wert</TableHead>
            <TableHead className="text-right">G/V</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {POSITIONS.map((r) => (
            <TableRow key={r.ticker} className="border-border">
              <TableCell>
                <div className="font-mono text-[12px] text-ink">{r.ticker}</div>
                <div className="text-[11px] text-muted">{r.name}</div>
              </TableCell>
              <TableCell className="font-mono text-[11px] text-dim">{r.broker}</TableCell>
              <TableCell className="text-right font-mono text-[12px] text-muted num">{r.qty}</TableCell>
              <TableCell className="text-right font-mono text-[12px] text-ink num">€{r.value}</TableCell>
              <TableCell className={`text-right font-mono text-[12px] num ${r.up ? "text-mint" : "text-bad"}`}>
                {r.pl}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Frame>
  );
}

/** Realised gains with a totals footer and an explanatory caption. */
export function RealisedGains() {
  return (
    <Frame className="max-w-2xl">
      <Table>
        <TableCaption>Aktien-Veräußerungsgewinne · Steuerjahr 2025</TableCaption>
        <TableHeader className="border-border">
          <TableRow className="border-border">
            <TableHead>Instrument</TableHead>
            <TableHead>Verkauft am</TableHead>
            <TableHead className="text-right">Erlös</TableHead>
            <TableHead className="text-right">G/V</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="border-border">
            <TableCell className="font-mono text-[12px] text-ink">ZIM</TableCell>
            <TableCell className="font-mono text-[12px] text-muted">14.03.2025</TableCell>
            <TableCell className="text-right font-mono text-[12px] text-ink num">€765,79</TableCell>
            <TableCell className="text-right font-mono text-[12px] text-bad num">−331,73</TableCell>
          </TableRow>
          <TableRow className="border-border">
            <TableCell className="font-mono text-[12px] text-ink">VUSA</TableCell>
            <TableCell className="font-mono text-[12px] text-muted">02.09.2025</TableCell>
            <TableCell className="text-right font-mono text-[12px] text-ink num">€1&nbsp;842,10</TableCell>
            <TableCell className="text-right font-mono text-[12px] text-mint num">+128,66</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter className="bg-panel2 border-border">
          <TableRow className="border-border">
            <TableCell className="font-mono text-[11px] uppercase tracking-widest text-dim">Summe</TableCell>
            <TableCell />
            <TableCell className="text-right font-mono text-[12px] text-ink num">€2&nbsp;607,89</TableCell>
            <TableCell className="text-right font-mono text-[12px] text-bad num">−203,07</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Frame>
  );
}

/** A narrow two-column table — the minimal shape, e.g. a Verlustvortrag summary. */
export function Minimal() {
  return (
    <Frame className="max-w-sm">
      <Table>
        <TableHeader className="border-border">
          <TableRow className="border-border">
            <TableHead>Verlusttopf</TableHead>
            <TableHead className="text-right">Vortrag</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="border-border">
            <TableCell className="text-ink text-[13px]">Aktien</TableCell>
            <TableCell className="text-right font-mono text-[12px] text-ink num">€1 204,50</TableCell>
          </TableRow>
          <TableRow className="border-border">
            <TableCell className="text-ink text-[13px]">Sonstige</TableCell>
            <TableCell className="text-right font-mono text-[12px] text-ink num">€312,80</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Frame>
  );
}
