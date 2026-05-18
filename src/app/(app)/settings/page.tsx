import { requireCurrentUser } from "@/lib/auth/server";
import { getSettings } from "@/lib/data/settings";
import { Card } from "@/components/pulse/card";
import { SettingRow } from "@/components/pulse/setting-row";

export default async function SettingsPage() {
  const user = await requireCurrentUser();
  const { settings, accounts } = await getSettings(user.id);
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <Card>
        <div className="font-bold text-base mb-3">Brokers</div>
        {accounts.length === 0 && <div className="text-muted text-sm">No broker accounts yet. Upload a statement to register one.</div>}
        {accounts.map(a => (
          <div key={a.id} className="flex justify-between items-center py-3 border-b border-border last:border-b-0">
            <div>
              <div className="font-mono text-xs text-mint">{a.broker}</div>
              <div className="text-sm">{a.accountNumber}</div>
            </div>
            <div className="font-mono text-xs text-muted">{a.baseCurrency}</div>
          </div>
        ))}
      </Card>

      <Card>
        <div className="font-bold text-base mb-3">Tax · Germany</div>
        <SettingRow label="Filing status" value={settings?.filingStatus ?? "SINGLE"} />
        <SettingRow label="Jurisdiction" value={settings?.jurisdiction ?? "DE"} />
        <SettingRow label="Sparer-Pauschbetrag" value={`€${settings?.saverAllowance ?? "1000"} / year`} />
        <SettingRow label="Lot method" value={settings?.lotMethod ?? "FIFO"} highlight />
        <SettingRow label="FX source" value={settings?.fxSource ?? "ECB"} last />
      </Card>

      <Card>
        <div className="font-bold text-base mb-1">Account</div>
        <SettingRow label="Email" value={user.email} />
        <SettingRow label="Name" value={user.name ?? "—"} last />
      </Card>
    </main>
  );
}
