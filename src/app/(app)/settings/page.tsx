import { desc } from "drizzle-orm";
import { requireCurrentUser } from "@/lib/auth/server";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSettings } from "@/lib/data/settings";
import { getDb } from "@/lib/db/client";
import { allowedEmails } from "@/lib/db/schema";
import { listCryptoAccountsForUser } from "@/lib/data/crypto-accounts";
import { Card } from "@/components/pulse/card";
import { SettingRow } from "@/components/pulse/setting-row";
import { TaxIncomeRow } from "@/components/pulse/tax-income-row";
import { ToggleRow } from "@/components/pulse/toggle-row";
import { SettingsSidebar } from "@/components/pulse/settings-sidebar";
import { ResetBrokerButton } from "@/components/pulse/reset-broker-button";
import { BackfillFxButton } from "@/components/pulse/backfill-fx-button";
import { RefreshQuotesButton } from "@/components/pulse/refresh-quotes-button";
import { QuoteStatusTable } from "@/components/pulse/quote-status-table";
import { getQuoteStatus } from "@/lib/data/quote-status";
import { MembersManager } from "@/components/pulse/members-manager";
import { CryptoAccountsManager } from "@/components/pulse/crypto-accounts-manager";

type SP = Promise<{ section?: string }>;

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireCurrentUser();
  const { settings, accounts } = await getSettings(user.id);
  const params = await searchParams;
  const section = params.section ?? "brokers";
  const isAdmin = isAdminEmail(user.email);
  const members = isAdmin && section === "members"
    ? await getDb().select().from(allowedEmails).orderBy(desc(allowedEmails.addedAt))
    : [];
  const cryptoAccounts = section === "crypto" ? await listCryptoAccountsForUser(user.id) : [];
  const quoteStatus = section === "tax" ? await getQuoteStatus(user.id) : [];

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        <SettingsSidebar active={section} isAdmin={isAdmin} />

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
                {(() => {
                  // Coinbase is managed in the dedicated Crypto exchanges section
                  // below (with its own connect/disconnect/sync controls). Listing
                  // it here too confused users — and the Reset button would orphan
                  // the encrypted API key in crypto_accounts. Filter it out.
                  const statementAccounts = accounts.filter((b) => b.broker !== "COINBASE");
                  if (statementAccounts.length === 0) {
                    return <div className="text-muted text-sm">No broker accounts yet. Upload a statement to register one.</div>;
                  }
                  return statementAccounts.map((b, i) => {
                  // Broker chip + label + mode are derived from a single map so the
                  // settings page stays in lockstep with the positions table, where
                  // brand colors identify each broker (IBKR red, Freedom green,
                  // Coinbase blue). Previously this page collapsed everything that
                  // wasn't FF into "IBKR" — which mislabeled Coinbase rows as IBKR.
                  const meta = {
                    INTERACTIVE_BROKERS: { short: "IBKR", label: "Interactive Brokers", mode: "Manual CSV uploads",  chip: "bg-brand-ibkr/15 text-brand-ibkr border border-brand-ibkr/30" },
                    FREEDOM_FINANCE:     { short: "FF",   label: "Freedom Finance",     mode: "Manual JSON uploads", chip: "bg-brand-freedom/15 text-brand-freedom border border-brand-freedom/30" },
                    COINBASE:            { short: "CB",   label: "Coinbase",            mode: "Live API sync",       chip: "bg-brand-coinbase/15 text-brand-coinbase border border-brand-coinbase/30" },
                  }[b.broker] ?? { short: b.broker.slice(0, 4).toUpperCase(), label: b.broker, mode: "—", chip: "bg-panel2 text-muted" };
                  return (
                    <div key={b.id} className={`grid grid-cols-[50px_1fr_1fr_1fr_1fr_auto] gap-3.5 py-3.5 items-center ${i > 0 ? "border-t border-border" : ""}`}>
                      <div className={`w-11 h-11 rounded-[12px] flex items-center justify-center font-mono font-bold text-[13px] ${meta.chip}`}>
                        {meta.short}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{meta.label}</div>
                        <div className="font-mono text-[11px] text-muted">{b.accountNumber}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Mode</div>
                        <div className="text-xs mt-1">{meta.mode}</div>
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
                        brokerLabel={meta.label}
                        accountNumber={b.accountNumber}
                      />
                    </div>
                  );
                });
                })()}
              </Card>
            </>
          )}

          {section === "crypto" && (
            <Card>
              <div className="flex flex-wrap gap-3 justify-between items-start mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-base">Crypto exchanges</div>
                    <span className="font-mono text-[9px] text-mint bg-mint/10 px-1.5 py-0.5 rounded tracking-wider whitespace-nowrap">● ENCRYPTED</span>
                  </div>
                  <div className="font-mono text-[11px] text-muted mt-1">
                    Connect a read-only Coinbase CDP key. Used for balance display + staking-income tracking (Anlage SO).
                  </div>
                </div>
              </div>
              <CryptoAccountsManager
                initial={cryptoAccounts.map((a) => ({
                  id: a.id,
                  exchange: a.exchange,
                  label: a.label,
                  status: a.status,
                  scopes: a.scopes,
                  lastSyncAt: a.lastSyncAt ? a.lastSyncAt.toISOString() : null,
                  lastSyncEventCount: a.lastSyncEventCount,
                  connectedAt: a.connectedAt.toISOString(),
                }))}
              />
            </Card>
          )}

          {section === "members" && isAdmin && (
            <Card>
              <div className="flex justify-between items-baseline mb-3">
                <div>
                  <div className="font-semibold text-base">Members</div>
                  <div className="font-mono text-[11px] text-muted mt-1">
                    Emails allowed to sign in to this workspace. Add a friend&apos;s Google account here, then share the sign-in link with them.
                  </div>
                </div>
                <div className="font-mono text-[10px] text-amber tracking-wider">ADMIN ONLY</div>
              </div>
              <MembersManager initial={members.map(m => ({
                id: m.id,
                email: m.email,
                note: m.note,
                addedAt: m.addedAt.toISOString(),
              }))} />
            </Card>
          )}

          {section === "members" && !isAdmin && (
            <Card>
              <div className="text-muted text-sm">Members are managed by the workspace admin.</div>
            </Card>
          )}

          {section === "tax" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Card>
                  <div className="font-semibold text-base mb-3">Tax &amp; jurisdiction</div>
                  <SettingRow label="Jurisdiction" value="🇩🇪 Germany" />
                  <SettingRow label="Filing status" value={settings?.filingStatus ?? "SINGLE"} />
                  <SettingRow label="Sparer-Pauschbetrag" value={`€${settings?.saverAllowance ?? "1000"} / year`} />
                  <SettingRow label="Lot matching" value={settings?.lotMethod ?? "FIFO"} highlight />
                  <SettingRow label="Loss carry-forward" value="—" last />
                  <TaxIncomeRow
                    initialIncome={settings?.taxableIncomeEur ?? null}
                    filingStatus={(settings?.filingStatus as "SINGLE" | "JOINT") ?? "SINGLE"}
                  />
                </Card>
                <Card>
                  <div className="font-semibold text-base mb-3">Currency &amp; FX</div>
                  <SettingRow label="Reporting currency" value="EUR (€)" />
                  <SettingRow label="FX rate source" value={settings?.fxSource ?? "ECB"} highlight />
                  <SettingRow label="Conversion basis" value="Trade date" />
                  <SettingRow label="FX gains in tax" value="Separate report" />
                  <SettingRow label="Round to" value="2 decimals" last />
                  <BackfillFxButton />
                  <RefreshQuotesButton />
                </Card>
              </div>
              <QuoteStatusTable rows={quoteStatus} />
            </div>
          )}

          {section === "notifications" && (
            <Card>
              <div className="font-semibold text-base mb-3">Notifications</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
