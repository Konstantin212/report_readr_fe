"use client";
import { Check } from "lucide-react";

export type Platform = "ibkr" | "freedom" | "coinbase";

const META: Record<Platform, {
  name: string;
  tagline: string;
  blurb: string;
  bgClass: string;
  inkClass: string;
  ringClass: string;
  mutedBgClass: string;
  mutedRingClass: string;
}> = {
  ibkr: {
    name: "Interactive Brokers",
    tagline: "Stocks · ETFs · Bonds · FX",
    blurb: "Activity Statement CSV",
    bgClass: "bg-brand-ibkr",
    inkClass: "text-white",
    ringClass: "ring-brand-ibkr/60",
    mutedBgClass: "bg-brand-ibkr/10",
    mutedRingClass: "ring-brand-ibkr/25",
  },
  freedom: {
    name: "Freedom24",
    tagline: "Stocks · Cash · FX · Dividends",
    blurb: "all-time JSON statement",
    bgClass: "bg-brand-freedom",
    inkClass: "text-white",
    ringClass: "ring-brand-freedom/60",
    mutedBgClass: "bg-brand-freedom/10",
    mutedRingClass: "ring-brand-freedom/25",
  },
  coinbase: {
    name: "Coinbase",
    tagline: "Crypto · Staking · §22 / §23",
    blurb: "live API sync",
    bgClass: "bg-brand-coinbase",
    inkClass: "text-white",
    ringClass: "ring-brand-coinbase/60",
    mutedBgClass: "bg-brand-coinbase/10",
    mutedRingClass: "ring-brand-coinbase/25",
  },
};

export function PlatformCard({
  platform,
  selected,
  onToggle,
}: {
  platform: Platform;
  selected: boolean;
  onToggle: () => void;
}) {
  const m = META[platform];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`relative text-left rounded-2xl p-5 transition-all duration-150 ring-2 focus:outline-none focus-visible:ring-4 ${
        selected
          ? `${m.bgClass} ${m.inkClass} ${m.ringClass} scale-[1.02] shadow-lg`
          : `${m.mutedBgClass} text-muted ${m.mutedRingClass} hover:scale-[1.01] hover:text-ink`
      }`}
    >
      {selected && (
        <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/95 text-bg flex items-center justify-center">
          <Check className="w-4 h-4" strokeWidth={3} />
        </span>
      )}
      <div className={`font-mono text-[10px] uppercase tracking-widest mb-3 ${selected ? "opacity-80" : "opacity-60"}`}>
        {m.tagline}
      </div>
      <div className={`font-bold text-[20px] tracking-tight leading-tight ${selected ? "" : "text-ink/80"}`}>
        {m.name}
      </div>
      <div className={`font-mono text-[11px] mt-4 ${selected ? "opacity-80" : "opacity-50"}`}>
        {m.blurb}
      </div>
    </button>
  );
}
