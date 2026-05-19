import { requireCurrentUser } from "@/lib/auth/server";
import { getSettings } from "@/lib/data/settings";
import { Card } from "@/components/pulse/card";
import { SettingRow } from "@/components/pulse/setting-row";
import { ToggleRow } from "@/components/pulse/toggle-row";
import { SettingsSidebar } from "@/components/pulse/settings-sidebar";
import { ResetBrokerButton } from "@/components/pulse/reset-broker-button";

type SP = Promise<{ section?: string }>;

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireCurrentUser();
  const { settings, accounts } = await getSettings(user.id);
  const params = await searchParams;
  const section = params.section ?? "brokers";

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <div className="grid grid-cols-[240px_1fr] gap-4">
        <SettingsSidebar active={section} />

        <div className="space-y-4">
          {section === "account" && (
            <Card>
              <div className="font-semibold text-base mb-3">Account</div>
              <SettingRow label="Email" value={user.email} />
              <SettingRow label="Name" value={user.name ?? "—"} last />
            </Card>
          )}

          {section === "brokers" && (
            <>
              <Card>
                <div className="flex justify-between items-baseline mb-3">
                  <div>
                    <div className="font-semibold text-base">Connected brokers</div>
                    <div className="font-mono text-[11px] text-muted mt-1">Manage data sources · all parsing happens locally</div>
                  </div>
                </div>
                {accounts.length === 0 && <div className="text-muted text-sm">No broker accounts yet. Upload a statement to register one.</div>}
                {accounts.map((b, i) => (
                  <div key={b.id} className={`grid grid-cols-[50px_1fr_1fr_1fr_1fr_auto] gap-3.5 py-3.5 items-center ${i > 0 ? "border-t border-border" : ""}`}>
                    <div className={`w-11 h-11 rounded-[12px] flex items-center justify-center font-mono font-bold text-[13px] ${
                      b.broker === "FREEDOM_FINANCE" ? "bg-amber/20 text-amber" : "bg-mint/20 text-mint"
                    }`}>
                      {b.broker === "FREEDOM_FINANCE" ? "FF" : "IBKR"}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{b.broker === "FREEDOM_FINANCE" ? "Freedom Finance" : "Interactive Brokers"}</div>
                      <div className="font-mono text-[11px] text-muted">{b.accountNumber}</div>
                    </div>
                    <div>
                      <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Mode</div>
                      <div className="text-xs mt-1">{b.broker === "FREEDOM_FINANCE" ? "Manual JSON uploads" : "Manual CSV uploads"}</div>
                    </div>
                    <div>
                      <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Base ccy</div>
                      <div className="text-xs mt-1">{b.baseCurrency}</div>
                    </div>
                    <div>
                      <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Status</div>
                      <div className="text-xs mt-1 text-mint">● Active</div>
                    </div>
                    <ResetBrokerButton
                      brokerAccountId={b.id}
                      brokerLabel={b.broker === "FREEDOM_FINANCE" ? "Freedom Finance" : "Interactive Brokers"}
                      accountNumber={b.accountNumber}
                    />
                  </div>
                ))}
              </Card>
            </>
          )}

          {section === "tax" && (
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <div className="font-semibold text-base mb-3">Tax &amp; jurisdiction</div>
                <SettingRow label="Jurisdiction" value="🇩🇪 Germany" />
                <SettingRow label="Filing status" value={settings?.filingStatus ?? "SINGLE"} />
                <SettingRow label="Sparer-Pauschbetrag" value={`€${settings?.saverAllowance ?? "1000"} / year`} />
                <SettingRow label="Lot matching" value={settings?.lotMethod ?? "FIFO"} highlight />
                <SettingRow label="Loss carry-forward" value="—" last />
              </Card>
              <Card>
                <div className="font-semibold text-base mb-3">Currency &amp; FX</div>
                <SettingRow label="Reporting currency" value="EUR (€)" />
                <SettingRow label="FX rate source" value={settings?.fxSource ?? "ECB"} highlight />
                <SettingRow label="Conversion basis" value="Trade date" />
                <SettingRow label="FX gains in tax" value="Separate report" />
                <SettingRow label="Round to" value="2 decimals" last />
              </Card>
            </div>
          )}

          {section === "notifications" && (
            <Card>
              <div className="font-semibold text-base mb-3">Notifications</div>
              <div className="grid grid-cols-2 gap-3">
                <ToggleRow label="Daily summary email" sub="One mail per day, 9:00" on={settings?.notifyDailySummary ?? false} />
                <ToggleRow label="Tax draft updates" sub="When realized lots change" on={false} />
              </div>
              <div className="text-[11px] text-dim mt-3 font-mono">Notifications wired in v3.</div>
            </Card>
          )}

          {section === "appearance" && (
            <Card>
              <div className="flex justify-between items-baseline mb-3">
                <div className="font-semibold text-base">Appearance &amp; privacy</div>
                <div className="font-mono text-[11px] text-mint tracking-wider">● 100% LOCAL PARSING</div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <ToggleRow label="Hide values" sub="Tap eye icon to reveal" on={settings?.hideValues ?? false} />
                <ToggleRow label="Auto-redact tickers" sub="Useful in screen shares" on={settings?.autoRedactTickers ?? false} />
                <ToggleRow label="Daily summary email" sub="One mail per day, 9:00" on={settings?.notifyDailySummary ?? false} />
              </div>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
