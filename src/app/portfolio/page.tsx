import { AppShell } from "@/components/app/app-shell";
import { PortfolioImportOverview } from "@/components/app/import-overview";
import { MetricCard } from "@/components/app/metric-card";
import { requireCurrentUser } from "@/lib/auth/server";
import { getPortfolioSummary } from "@/lib/data/portfolio";

export default async function PortfolioPage() {
  const user = await requireCurrentUser();
  const portfolio = await getPortfolioSummary(user.id);

  return (
    <AppShell>
      <section>
        <p className="text-sm font-medium text-secondary">Portfolio</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Accounts first, details on demand.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          The portfolio view starts with compact account cards. Position-level tables belong in account detail views after imports are persisted.
        </p>
      </section>
      {portfolio.storageMode === "LOCAL" ? (
        <PortfolioImportOverview />
      ) : (
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {portfolio.accounts.length === 0 ? (
            <>
              <MetricCard label="Interactive Brokers" value="Not imported" detail="Stocks, bonds, cash" />
              <MetricCard label="Freedom Finance" value="Not imported" detail="Trades, dividends, fees" tone="secondary" />
            </>
          ) : (
            portfolio.accounts.map((account) => (
              <MetricCard
                key={`${account.broker}:${account.accountNumber}`}
                label={account.broker === "INTERACTIVE_BROKERS" ? "Interactive Brokers" : "Freedom Finance"}
                value={account.accountNumber}
                detail={`${account.eventCount} events - ${account.baseCurrency} base`}
                tone={account.broker === "INTERACTIVE_BROKERS" ? "primary" : "secondary"}
              >
                <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                  <p>Cash: {formatCash(account.ledger.cashByCurrency)}</p>
                  <p>Cash impact EUR: €{account.ledger.cashByCurrencyEur}</p>
                  <p>Positions: {account.ledger.positions.length}</p>
                  <p>Realized P/L EUR: €{account.ledger.realizedPnlEur}</p>
                  {account.ledger.reviewAlerts.length > 0 ? <p>{account.ledger.reviewAlerts.length} review alerts</p> : null}
                </div>
                <details className="mt-4 rounded-md border border-border bg-background/45 p-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-foreground">Account details</summary>
                  <div className="mt-3 grid gap-4 text-muted-foreground">
                    <section>
                      <p className="text-xs font-semibold uppercase tracking-normal text-foreground">Positions</p>
                      <div className="mt-2 grid gap-2">
                        {account.ledger.positions.length === 0 ? (
                          <p>No open positions from imported events.</p>
                        ) : (
                          account.ledger.positions.slice(0, 8).map((position) => (
                            <div key={`${position.symbol}:${position.currency}`} className="flex justify-between gap-3">
                              <span>{position.symbol}</span>
                              <span>
                                {position.quantity} {position.currency}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                    {account.ledger.reviewAlerts.length > 0 ? (
                      <section>
                        <p className="text-xs font-semibold uppercase tracking-normal text-foreground">Review alerts</p>
                        <div className="mt-2 grid gap-2">
                          {account.ledger.reviewAlerts.slice(0, 4).map((alert) => (
                            <p key={alert.eventId}>{alert.message}</p>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </details>
              </MetricCard>
            ))
          )}
        </section>
      )}
    </AppShell>
  );
}

function formatCash(cashByCurrency: Record<string, string>): string {
  const entries = Object.entries(cashByCurrency);
  if (entries.length === 0) {
    return "No cash events";
  }

  return entries.map(([currency, amount]) => `${amount} ${currency}`).join(", ");
}
