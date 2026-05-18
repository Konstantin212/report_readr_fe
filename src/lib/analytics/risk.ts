function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
}

function stddev(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

export function volatility(monthlyReturns: number[]): number {
  if (monthlyReturns.length < 2) return 0;
  const sd = stddev(monthlyReturns);
  return sd * Math.sqrt(12);
}

export function sharpe(
  annualizedReturn: number,
  volatilityValue: number,
  riskFreeRate = 0,
): number {
  if (volatilityValue === 0) return 0;
  return (annualizedReturn - riskFreeRate) / volatilityValue;
}

export function beta(portfolioReturns: number[], benchmarkReturns: number[]): number {
  if (portfolioReturns.length === 0 || benchmarkReturns.length === 0) return 0;
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  const port = portfolioReturns.slice(0, n);
  const bench = benchmarkReturns.slice(0, n);

  const benchVar = variance(bench);
  if (benchVar === 0) return 0;

  const mPort = mean(port);
  const mBench = mean(bench);

  const cov =
    port.reduce((sum, p, i) => sum + (p - mPort) * (bench[i] - mBench), 0) /
    (n - 1);

  return cov / benchVar;
}

export function maxDrawdown(values: number[]): number {
  if (values.length < 2) return 0;
  let peak = values[0];
  let maxDD = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = peak === 0 ? 0 : v / peak - 1;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}
