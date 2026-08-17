"use client";

import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
} from "@/lib/feedback/categories";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * Signed-in feedback form in a modal. Mirrors the ESC + backdrop-click
 * close pattern from AuthModal. Posts to /api/feedback; identity is taken
 * server-side from the session, so no name/email fields here.
 */
export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        setError(body.error ?? "Could not send your message. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("sent");
      setMessage("");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[rgba(6,7,9,.72)] backdrop-blur flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[440px] bg-panel border border-border rounded-2xl p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 z-10 w-[32px] h-[32px] rounded-md border border-borderHard bg-panel flex items-center justify-center text-muted hover:text-ink transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {status === "sent" ? (
          <div className="space-y-3">
            <h2 className="font-bold text-lg tracking-tight">Thanks!</h2>
            <p className="text-muted text-sm">I&apos;ll get back to you soon.</p>
            <button
              type="button"
              onClick={onClose}
              className="bg-mint text-bg font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-lg font-semibold"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h2 className="font-bold text-lg tracking-tight">Send feedback</h2>

            <label className="block space-y-1.5">
              <span className="font-mono text-[11px] text-muted uppercase tracking-widest">Type</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                className="w-full bg-bg border-border rounded-lg px-3 py-2 text-sm"
              >
                {FEEDBACK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {FEEDBACK_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="font-mono text-[11px] text-muted uppercase tracking-widest">Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                maxLength={5000}
                rows={5}
                className="w-full bg-bg border-border rounded-lg px-3 py-2 text-sm resize-y"
              />
            </label>

            {error && <p className="text-sm text-pink">{error}</p>}

            <button
              type="submit"
              disabled={status === "sending" || !message.trim()}
              className="bg-mint text-bg font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-lg font-semibold disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
