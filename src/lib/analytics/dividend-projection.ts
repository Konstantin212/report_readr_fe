import Decimal from "decimal.js";

export type DividendProjection = {
  yearEur: number;
  next30DaysEur: number;
  next30Count: number;
};

export function projectDividends(
  ttmDividends: { date: string; amountEur: number }[],
  upcoming: { date: string; amountEur: number }[] = [],
  asOf: Date = new Date(),
): DividendProjection {
  // Compute next 30 days from upcoming list
  const cutoff = new Date(asOf.getTime() + 30 * 24 * 3600 * 1000);
  const next30 = upcoming.filter((u) => {
    const d = new Date(u.date);
    return d > asOf && d <= cutoff;
  });
  const next30DaysEur = next30.reduce((s, u) => s + u.amountEur, 0);
  const next30Count = next30.length;

  if (ttmDividends.length === 0) {
    return { yearEur: 0, next30DaysEur, next30Count };
  }

  const sorted = [...ttmDividends].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = new Date(sorted[0].date).getTime();
  const lastDate = new Date(sorted[sorted.length - 1].date).getTime();
  const spanDays = (lastDate - firstDate) / (24 * 3600 * 1000);

  // Not enough signal
  if (spanDays < 90) {
    return { yearEur: 0, next30DaysEur, next30Count };
  }

  const totalEur = sorted.reduce(
    (s, d) => s.plus(d.amountEur),
    new Decimal(0),
  );

  // Linear extrapolation to a full year
  const yearEur = totalEur.mul(365).div(spanDays).toNumber();

  return { yearEur, next30DaysEur, next30Count };
}
