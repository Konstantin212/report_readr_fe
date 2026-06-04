import { requireCurrentUser } from "@/lib/auth/server";
import { getCryptoPositions, rollUpCryptoPositions } from "@/lib/data/crypto-positions";
import { Card } from "@/components/pulse/card";
import { CryptoPositionsSection } from "@/components/pulse/crypto-positions-section";

export default async function CryptoPage() {
  const user = await requireCurrentUser();
  const positions = await getCryptoPositions(user.id);
  const rollup = rollUpCryptoPositions(positions);

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Crypto{" "}
          <span className="font-mono text-sm text-muted ml-1 tracking-wider">
            {positions.length} {positions.length === 1 ? "coin" : "coins"}
          </span>
        </h1>
      </div>

      {positions.length === 0 ? (
        <Card>
          <div className="text-muted text-sm">
            No crypto positions yet. Connect a Coinbase account in{" "}
            <a href="/settings" className="text-mint underline">Settings</a>{" "}
            and run a sync to populate this page.
          </div>
        </Card>
      ) : (
        <CryptoPositionsSection positions={positions} rollup={rollup} />
      )}
    </main>
  );
}
