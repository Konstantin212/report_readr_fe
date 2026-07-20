import { DividendMonthlyBars } from "report-readr-fe";
import { Frame } from "./_frame";

const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Current tax year to date: Jan–Jul are received amounts (EUR), the current
 * month (Jul, index 6) is highlighted in full amber, and the remaining
 * months are still projected — rendered as dashed empty outlines rather
 * than zero-height bars.
 */
export function Default() {
  const values = [120, 45, 310, 58, 62, 340, 88, 0, 0, 0, 0, 0];
  return (
    <Frame className="max-w-lg">
      <DividendMonthlyBars values={values} monthLabels={MONTH_LABELS} highlightIdx={6} />
    </Frame>
  );
}

/** A closed-out prior year — every month has an actual payout, best month (Dec quarterly cluster) highlighted. */
export function YearComplete() {
  const values = [98, 52, 287, 61, 74, 312, 68, 55, 265, 71, 84, 356];
  return (
    <Frame className="max-w-lg">
      <DividendMonthlyBars values={values} monthLabels={MONTH_LABELS} highlightIdx={11} />
    </Frame>
  );
}

/** Early in the tax year — only Jan–Mar received, the rest still projected placeholders. */
export function EarlyYear() {
  const values = [105, 38, 244, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return (
    <Frame className="max-w-lg">
      <DividendMonthlyBars values={values} monthLabels={MONTH_LABELS} highlightIdx={2} />
    </Frame>
  );
}
