import Link from "next/link";
import { BrokerFilter } from "@/components/pulse/broker-filter";
import { TopbarNav } from "@/components/pulse/topbar-nav";
import { UserMenu } from "@/components/pulse/user-menu";
import { TourTrigger } from "@/components/onboarding/tour-host";

export function Topbar({
  user,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null } | null;
}) {
  return (
    <header className="sticky top-0 z-20 -mx-3 sm:-mx-5 lg:-mx-7 px-3 sm:px-5 lg:px-7 mb-7 flex items-center gap-6 bg-bg/[.86] backdrop-blur-[14px] border-b border-border py-3">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-[10px] bg-mint text-bg font-mono font-bold flex items-center justify-center">◐</span>
        <span className="font-sans font-bold text-lg tracking-tight">folio<span className="text-mint">.</span></span>
      </Link>
      <div className="hidden lg:contents">
        <TopbarNav />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <BrokerFilter />
        <TourTrigger />
        <UserMenu name={user?.name} email={user?.email} />
      </div>
    </header>
  );
}
