import { requireCurrentUser } from "@/lib/auth/server";
import { Topbar } from "@/components/pulse/topbar";
import { PnlModeProvider } from "@/components/pulse/pnl-mode";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  return (
    <PnlModeProvider>
      <div className="min-h-screen max-w-[1320px] mx-auto px-7 pt-7">
        <Topbar user={user} />
        {children}
      </div>
    </PnlModeProvider>
  );
}
