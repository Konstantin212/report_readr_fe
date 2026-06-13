import { requireCurrentUser } from "@/lib/auth/server";
import { getTaxData } from "@/lib/data/tax";
import { getPositionsData } from "@/lib/data/positions";
import { classifyKind, classifySector } from "@/lib/analytics/sector-map";
import {
  buildCandidates,
  computeHarvest,
  decodeSellParams,
  suggestOptimum,
  type HarvestInputs,
  type HarvestResult,
  type SellInstruction,
} from "@/lib/tax/loss-harvest";
import { LossHarvestPanel } from "@/components/pulse/loss-harvest-panel";

type SP = Promise<{ sell?: string }>;

export default async function LossHarvestPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: SP;
}) {
  const user = await requireCurrentUser();
  const { year } = await params;
  const yearNum = Number(year);
  const sp = await searchParams;
  const sellParam = sp.sell ?? "";

  const [taxData, positionsData] = await Promise.all([
    getTaxData(user.id, yearNum),
    getPositionsData(user.id, { broker: "all", sector: null, symbol: null }),
  ]);

  const candidates = buildCandidates(positionsData.rows);

  // Split realised gains per match into Aktien vs Sonstige using the same
  // kind classifier the positions table uses. Without this, attributing all
  // gains to one bucket can produce categorically wrong harvest suggestions
  // for ETF-heavy portfolios (e.g. recommend selling stock losses to offset
  // an ETF gain — which §20 Abs. 6 forbids).
  let aktienRealisedGainsEur = 0;
  let sonstigeRealisedGainsEur = 0;
  for (const lot of taxData.realizedLots) {
    const sector = classifySector(lot.ticker);
    const kind = classifyKind(lot.ticker, sector);
    if (kind === "stock") aktienRealisedGainsEur += lot.gainEur;
    else sonstigeRealisedGainsEur += lot.gainEur;
  }

  const aktienIncome = aktienRealisedGainsEur;
  const sonstigeIncome =
    sonstigeRealisedGainsEur
    + taxData.allowance.breakdown.dividendsEur
    + taxData.allowance.breakdown.interestEur
    + (taxData.forecast?.additionalDividendsEur ?? 0);

  const inputs: HarvestInputs = {
    allowanceEur: taxData.allowance.totalEur,
    aktien: {
      realisedGainsEur: aktienRealisedGainsEur,
      dividendsEur: 0,
      interestEur: 0,
      forecastAdditionalEur: 0,
      totalIncomeEur: aktienIncome,
    },
    sonstige: {
      realisedGainsEur: sonstigeRealisedGainsEur,
      dividendsEur: taxData.allowance.breakdown.dividendsEur,
      interestEur: taxData.allowance.breakdown.interestEur,
      forecastAdditionalEur: taxData.forecast?.additionalDividendsEur ?? 0,
      totalIncomeEur: sonstigeIncome,
    },
    candidates,
  };

  const sells: SellInstruction[] = decodeSellParams(sellParam, candidates);
  const result: HarvestResult = computeHarvest(inputs, sells);
  const optimum: SellInstruction[] = suggestOptimum(inputs);

  return (
    <main className="space-y-4">
      <div className="space-y-2">
        <a href={`/tax/${yearNum}`} className="font-mono text-[11px] text-muted hover:text-ink inline-block">
          ← Back to Anlage KAP
        </a>
        <h1 className="text-2xl font-bold tracking-tight">
          Loss Harvest{" "}
          <span className="font-mono text-sm text-muted ml-1 tracking-wider block lg:inline">
            {yearNum} · §20 Abs. 6 EStG · Sparer-Pauschbetrag optimiser
          </span>
        </h1>
      </div>

      <LossHarvestPanel
        year={yearNum}
        candidates={candidates}
        sells={sells}
        result={result}
        optimum={optimum}
        inputs={inputs}
        forecastDaysRemaining={taxData.forecast?.daysRemaining ?? 0}
      />
    </main>
  );
}
