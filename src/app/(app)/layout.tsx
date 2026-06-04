import { requireCurrentUser } from "@/lib/auth/server";
import { Topbar } from "@/components/pulse/topbar";
import { PnlModeProvider } from "@/components/pulse/pnl-mode";
import { BottomNav } from "@/components/pulse/bottom-nav";
import { TourHost } from "@/components/onboarding/tour-host";
import { getImportCount } from "@/lib/data/imports";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  // First-run trigger for the welcome tour. Cheap count query — runs
  // once per page load. If a future user has many thousands of imports
  // we'll switch to a "first import" timestamp on the user table.
  const importCount = await getImportCount(user.id);
  const firstName = user.name?.split(/\s+/)[0];
  return (
    <PnlModeProvider>
      <TourHost shouldShow={importCount === 0} firstName={firstName ?? null}>
        <div className="min-h-screen max-w-[1320px] mx-auto px-3 sm:px-5 lg:px-7 pt-4 lg:pt-7 pb-20 lg:pb-7">
          <Topbar user={user} />
          {children}
          <BottomNav />
        </div>
      </TourHost>
    </PnlModeProvider>
  );
}
