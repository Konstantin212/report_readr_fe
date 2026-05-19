import { requireCurrentUser } from "@/lib/auth/server";
import { Topbar } from "@/components/pulse/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  return (
    <div className="min-h-screen max-w-[1320px] mx-auto px-7 pt-7">
      <Topbar user={user} />
      {children}
    </div>
  );
}
