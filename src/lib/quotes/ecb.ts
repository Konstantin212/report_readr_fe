import { XMLParser } from "fast-xml-parser";

export type EcbRate = { date: string; fromCurrency: string; toCurrency: "EUR"; rate: string };

export function parseEcbXml(xml: string): EcbRate[] {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" }).parse(xml);
  const dayList = doc["gesmes:Envelope"]?.Cube?.Cube;
  if (!dayList) return [];
  const days = Array.isArray(dayList) ? dayList : [dayList];
  const out: EcbRate[] = [];
  for (const day of days) {
    const date = day.time as string;
    const rateList = day.Cube;
    const rates = Array.isArray(rateList) ? rateList : [rateList];
    for (const r of rates) {
      out.push({ date, fromCurrency: r.currency, toCurrency: "EUR", rate: String(r.rate) });
    }
  }
  return out;
}

export async function fetchEcbDaily(): Promise<EcbRate[]> {
  const res = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", { cache: "no-store" });
  if (!res.ok) throw new Error(`ECB fetch failed: ${res.status}`);
  return parseEcbXml(await res.text());
}
