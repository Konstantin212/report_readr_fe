import { cn } from "@/lib/utils";

export function Pill({
  active, className, children, ...props
}: { active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "px-3 py-1.5 rounded-full font-mono text-xs uppercase tracking-wider border",
        active ? "bg-mint text-bg border-mint" : "bg-transparent text-ink border-borderHard",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
