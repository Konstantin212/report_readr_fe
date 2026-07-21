import { requireCurrentUser } from "@/lib/auth/server";
import { PositionsClient } from "@/components/pulse/positions-client";
import type { PositionSort } from "@/lib/analytics/positions-view";

type SP = Promise<{ broker?: string; sector?: string; sort?: string }>;

/**
 * Thin server shell — enforces auth and reads the cross-page filters from
 * the URL, then hands off to the client component. The heavy positions load
 * happens client-side via React Query (see PositionsClient), so it's cached
 * across navigation and opening/closing a position is instant client state
 * rather than a full server re-render.
 */
export default async function PositionsPage({ searchParams }: { searchParams: SP }) {
  await requireCurrentUser();
  const params = await searchParams;
  const broker = (params.broker === "ff" || params.broker === "ibkr" ? params.broker : "all") as "all" | "ff" | "ibkr";
  const sector = params.sector ?? null;
  const sort = (["value", "gain", "az"].includes(params.sort ?? "") ? params.sort : "value") as PositionSort;

  return <PositionsClient broker={broker} sector={sector} sort={sort} />;
}
