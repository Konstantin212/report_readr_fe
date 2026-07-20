import { DividendMiniBars } from "report-readr-fe";
import { Frame } from "./_frame";

/**
 * Trailing 12-month dividend income sparkline — quarterly payers (SCHD,
 * VHYL) cluster payouts in Mar/Jun/Sep/Dec, so the bars step up every third
 * month rather than growing evenly. Last bar (current month) is always the
 * accent color; the rest are dimmed.
 */
export function Default() {
  const values = [45, 210, 38, 52, 340, 41, 48, 265, 55, 62, 298, 71];
  const months = ["AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL"];
  return (
    <Frame className="max-w-xs">
      <DividendMiniBars values={values} months={months} />
    </Frame>
  );
}

/** A brand-new position's first-ever payout — one bar, always shown highlighted. */
export function SinglePayment() {
  const values = [128];
  const months = ["JUL"];
  return (
    <Frame className="max-w-xs">
      <DividendMiniBars values={values} months={months} />
    </Frame>
  );
}

/** No dividend history yet — a freshly imported growth-only account. */
export function Empty() {
  return (
    <Frame className="max-w-xs">
      <DividendMiniBars values={[]} months={[]} />
    </Frame>
  );
}
