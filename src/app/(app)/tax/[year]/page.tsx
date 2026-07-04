import { requireCurrentUser } from "@/lib/auth/server";
import { TaxClient } from "@/components/pulse/tax-client";

/**
 * Thin server shell — enforces auth, then hands off to the client component
 * which loads the tax draft via React Query. Keeping the fetch client-side
 * means navigating away and back (positions ⇄ tax) serves from cache
 * instead of rebuilding the whole draft on every visit.
 */
export default async function TaxPage({ params }: { params: Promise<{ year: string }> }) {
  await requireCurrentUser();
  const { year } = await params;
  return <TaxClient year={Number(year)} />;
}
