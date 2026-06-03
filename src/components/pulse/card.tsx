import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Card({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("bg-panel border border-border rounded-[22px] p-[22px]", className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
