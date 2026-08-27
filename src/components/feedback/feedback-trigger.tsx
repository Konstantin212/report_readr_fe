"use client";

import { useState } from "react";

import { FeedbackModal } from "./feedback-modal";

/**
 * Topbar button that opens the feedback modal. Own client leaf so only
 * the open/close state is client-side (the topbar stays a server component).
 */
export function FeedbackTrigger({ accountEmail }: { accountEmail?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-xs uppercase tracking-widest text-muted hover:text-ink px-3 py-2 rounded-lg border border-border"
      >
        Feedback
      </button>
      <FeedbackModal
        open={open}
        onClose={() => setOpen(false)}
        accountEmail={accountEmail}
      />
    </>
  );
}
