import { requireCurrentUser } from "@/lib/auth/server";
import { Topbar } from "@/components/pulse/topbar";
import { PnlModeProvider } from "@/components/pulse/pnl-mode";
import { BottomNav } from "@/components/pulse/bottom-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  return (
    <PnlModeProvider>
      <div className="min-h-screen max-w-[1320px] mx-auto px-3 sm:px-5 lg:px-7 pt-4 lg:pt-7 pb-20 lg:pb-7">
        <Topbar user={user} />
        {children}
        <BottomNav />
      </div>
    </PnlModeProvider>
  );
}
