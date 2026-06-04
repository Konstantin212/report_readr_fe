"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CircleHelp } from "lucide-react";
import { WelcomeTour } from "./welcome-tour";

/**
 * Couples the WelcomeTour modal to the topbar "?" button. The modal is
 * the single source of state — it auto-opens for first-run users
 * (shouldShow + no localStorage flag), and the trigger lets returning
 * users reopen it.
 *
 * We don't want two competing copies of the modal mounted, so we expose
 * the open-trigger via a tiny context shared between the host (in the
 * layout) and the trigger (in the topbar).
 */

type Ctx = { open: () => void };
const TourCtx = createContext<Ctx>({ open: () => {} });

export function TourHost({
  shouldShow,
  firstName,
  children,
}: {
  shouldShow: boolean;
  firstName?: string | null;
  children: React.ReactNode;
}) {
  const [forceOpen, setForceOpen] = useState(false);
  // We bump a counter every time the user reopens via the trigger so
  // the WelcomeTour effect re-fires even if forceOpen was already true.
  const [openCount, setOpenCount] = useState(0);

  const open = useCallback(() => {
    setForceOpen(true);
    setOpenCount((n) => n + 1);
  }, []);
  const onClose = useCallback(() => setForceOpen(false), []);

  const ctx = useMemo(() => ({ open }), [open]);

  return (
    <TourCtx.Provider value={ctx}>
      {children}
      <WelcomeTour
        key={openCount}
        shouldShow={shouldShow}
        firstName={firstName}
        forceOpen={forceOpen}
        onClose={onClose}
      />
    </TourCtx.Provider>
  );
}

export function TourTrigger({ className }: { className?: string }) {
  const { open } = useContext(TourCtx);
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Open welcome tour"
      title="How to use this app"
      className={
        className ??
        "rounded-md w-8 h-8 flex items-center justify-center text-muted hover:text-ink hover:bg-panel2 transition-colors"
      }
    >
      <CircleHelp className="w-4 h-4" />
    </button>
  );
}
