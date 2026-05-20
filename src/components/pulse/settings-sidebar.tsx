"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export const SETTINGS_SECTIONS = [
  { key: "account",       label: "Account",        icon: "◔" },
  { key: "brokers",       label: "Brokers & data", icon: "◐" },
  { key: "tax",           label: "Tax & currency", icon: "◑" },
  { key: "members",       label: "Members",        icon: "◕", adminOnly: true },
  { key: "notifications", label: "Notifications",  icon: "◓" },
  { key: "appearance",    label: "Appearance",     icon: "◒" },
] as const;

export function SettingsSidebar({ active = "account", isAdmin = false }: { active?: string; isAdmin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <div className="bg-panel border border-border rounded-[22px] p-2.5 h-fit">
      {SETTINGS_SECTIONS.filter((n) => !("adminOnly" in n && n.adminOnly) || isAdmin).map((n) => {
        const isActive = active === n.key;
        return (
          <button
            key={n.key}
            onClick={() => {
              const p = new URLSearchParams(sp.toString());
              p.set("section", n.key);
              router.replace(`${pathname}?${p.toString()}` as never);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[12px] font-medium text-[13px] text-left ${
              isActive ? "bg-panel2 text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <span className={`font-mono text-sm font-bold ${isActive ? "text-mint" : "text-dim"}`}>{n.icon}</span>
            <span>{n.label}</span>
          </button>
        );
      })}
    </div>
  );
}
