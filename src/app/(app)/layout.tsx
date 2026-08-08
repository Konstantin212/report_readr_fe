import { requireCurrentUser } from "@/lib/auth/server";
import { getAppNavContext } from "@/lib/auth/require-admin";
import { Topbar } from "@/components/pulse/topbar";
import { PnlModeProvider } from "@/components/pulse/pnl-mode";
import { BottomNav } from "@/components/pulse/bottom-nav";
import { TourHost } from "@/components/onboarding/tour-host";
import { QueryProvider } from "@/components/query-provider";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { getImportCount } from "@/lib/data/imports";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  // AC-2.4 (admin nav link) / AC-5.2 (impersonation banner) — a single
  // cheap read, deliberately separate from requireCurrentUser()'s own
  // AppSessionUser shape (see require-admin.ts's doc-comment).
  const navContext = await getAppNavContext();
  // First-run trigger for the welcome tour. Cheap count query — runs
  // once per page load. If a future user has many thousands of imports
  // we'll switch to a "first import" timestamp on the user table.
  const importCount = await getImportCount(user.id);
  const firstName = user.name?.split(/\s+/)[0];
  return (
    <QueryProvider>
      <PnlModeProvider>
        <TourHost shouldShow={importCount === 0} firstName={firstName ?? null}>
          <div className="min-h-screen max-w-[1160px] mx-auto px-3 sm:px-5 lg:px-7 pt-4 lg:pt-7 pb-20 lg:pb-7">
            {navContext.impersonation.active && (
              <ImpersonationBanner
                targetEmail={navContext.impersonation.targetEmail}
                targetName={navContext.impersonation.targetName}
              />
            )}
            <Topbar user={user} isAdmin={navContext.isAdmin} />
            {children}
            <BottomNav />
          </div>
        </TourHost>
      </PnlModeProvider>
    </QueryProvider>
  );
}
