export type IndexedSeries = { dates: string[]; values: number[] };

export function indexToBaseline(
  closes: number[],
  dates: string[],
  baseline = 100,
): IndexedSeries {
  if (closes.length === 0) return { dates: [], values: [] };

  const first = closes[0];
  if (first === 0) return { dates: dates.slice(), values: closes.map(() => baseline) };

  const values = closes.map((c) => (baseline * c) / first);
  return { dates: dates.slice(), values };
}

export function alignBenchmarkToCurve(
  portfolioPoints: { date: string; valueEur: number }[],
  benchmarkRows: { date: string; close: number }[],
): IndexedSeries {
  if (portfolioPoints.length === 0) return { dates: [], values: [] };

  // Build a date→close lookup
  const closeByDate = new Map<string, number>(
    benchmarkRows.map((r) => [r.date, r.close]),
  );

  // Sorted benchmark dates for forward-fill
  const sortedBenchDates = [...closeByDate.keys()].sort();

  const alignedCloses: number[] = [];
  const alignedDates: string[] = [];

  let lastKnownClose: number | undefined;

  for (const p of portfolioPoints) {
    let best: number | undefined = closeByDate.get(p.date);
    if (best === undefined) {
      // Forward-fill: use most recent bench date <= p.date
      for (const bd of sortedBenchDates) {
        if (bd <= p.date) {
          best = closeByDate.get(bd);
        } else {
          break;
        }
      }
    }
    if (best !== undefined) lastKnownClose = best;
    alignedCloses.push(lastKnownClose ?? 0);
    alignedDates.push(p.date);
  }

  return indexToBaseline(alignedCloses, alignedDates);
}
