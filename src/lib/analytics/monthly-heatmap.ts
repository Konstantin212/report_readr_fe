export type HeatmapRow = {
  year: number;
  /** 12-entry array (Jan=0 .. Dec=11), % return for each month */
  months: number[];
};

export function buildMonthlyHeatmap(
  points: { date: string; valueEur: number }[],
): HeatmapRow[] {
  if (points.length < 2) return [];

  // Sort by date just in case
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

  // year → [12 entries, 0-filled]
  const rows = new Map<number, number[]>();

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const ret = prev.valueEur === 0 ? 0 : curr.valueEur / prev.valueEur - 1;

    const year = parseInt(curr.date.slice(0, 4), 10);
    const month = parseInt(curr.date.slice(5, 7), 10) - 1; // 0-based Jan=0

    if (!rows.has(year)) {
      rows.set(year, Array(12).fill(0));
    }
    rows.get(year)![month] = ret;
  }

  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, months]) => ({ year, months }));
}
