export function periodReturn(values: number[]): number {
  if (values.length === 0 || values[0] === 0) return 0;
  return values[values.length - 1] / values[0] - 1;
}

export function monthlyReturns(values: number[]): number[] {
  if (values.length < 2) return [];
  const result: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    result.push(prev === 0 ? 0 : values[i] / prev - 1);
  }
  return result;
}

export function twr(returns: number[]): number {
  if (returns.length === 0) return 0;
  let product = 1;
  for (const r of returns) {
    product *= 1 + r;
  }
  return product - 1;
}

export function annualizedTwr(cumulativeReturn: number, periodDays: number): number {
  if (periodDays < 30) return cumulativeReturn;
  return Math.pow(1 + cumulativeReturn, 365 / periodDays) - 1;
}

export function mwr(
  cashflows: { date: string; amount: number }[],
  endingValue: number,
  endingDate: string,
): number {
  if (cashflows.length < 1) return 0;

  // Full series: original cashflows + ending value as positive inflow
  const allFlows = [
    ...cashflows,
    { date: endingDate, amount: endingValue },
  ];

  if (allFlows.length < 2) return 0;

  const firstDate = new Date(allFlows[0].date).getTime();

  // Convert dates to year fractions from first date
  const flows = allFlows.map((cf) => ({
    t: (new Date(cf.date).getTime() - firstDate) / (365.25 * 24 * 3600 * 1000),
    amount: cf.amount,
  }));

  // NPV function
  const npv = (r: number) =>
    flows.reduce((sum, cf) => sum + cf.amount / Math.pow(1 + r, cf.t), 0);

  const dnpv = (r: number) =>
    flows.reduce(
      (sum, cf) => sum - (cf.t * cf.amount) / Math.pow(1 + r, cf.t + 1),
      0,
    );

  // Newton-Raphson
  let r = 0.1;
  for (let i = 0; i < 50; i++) {
    const f = npv(r);
    const df = dnpv(r);
    if (df === 0) return 0;
    const next = r - f / df;
    if (Math.abs(next - r) < 1e-8) return isFinite(next) ? next : 0;
    r = next;
    if (!isFinite(r)) return 0;
  }

  return isFinite(r) ? r : 0;
}
