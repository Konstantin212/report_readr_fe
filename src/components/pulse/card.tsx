import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bg-panel border border-border rounded-[22px] p-[22px]", className)} {...props}>
      {children}
    </div>
  );
}
