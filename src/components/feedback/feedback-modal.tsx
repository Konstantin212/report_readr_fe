"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
} from "@/lib/feedback/categories";

type Status = "idle" | "sending" | "sent" | "error";

const FIELD_CLASS =
  "w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-ink " +
  "placeholder:text-dim focus:outline-none focus:border-mint/60 transition-colors";

const LABEL_CLASS = "font-mono text-[10px] uppercase tracking-widest text-dim";

/**
 * Signed-in feedback form in a modal. Mirrors the ESC + backdrop-click
 * close pattern from AuthModal. Posts to /api/feedback; the submitter's
 * identity comes from the session server-side, so the contact field only
 * overrides where a reply should go.
 *
 * Rendered through a portal on document.body: the trigger lives in the
 * topbar, whose `backdrop-blur` establishes a containing block, and a
 * `position: fixed` overlay left inside it would be clipped to the header
 * strip instead of covering the viewport.
 */
export function FeedbackModal({
  open,
  onClose,
  accountEmail,
}: {
  open: boolean;
  onClose: () => void;
  accountEmail?: string | null;
}) {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [subject, setSubject] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  // Portals need a DOM to target, so hold rendering until after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The modal stays mounted (only the `open` prop toggles rendering), so
  // reset the form each time it opens — otherwise a prior "sent" status
  // sticks and every reopen shows "Thanks!" instead of a fresh form.
  // Keyed on `open` only: keying on `onClose` (a fresh arrow each render
  // from the trigger) would re-run on every render and wipe mid-typing.
  useEffect(() => {
    if (!open) return;
    setCategory("bug");
    setSubject("");
    setContactEmail(accountEmail ?? "");
    setMessage("");
    setStatus("idle");
    setError(null);
  }, [open, accountEmail]);

  // Focus once the form is actually on screen — on a reopen the first
  // render still shows the previous "sent" panel, so the ref is null until
  // the reset above lands.
  useEffect(() => {
    if (open && status === "idle") subjectRef.current?.focus();
  }, [open, status]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Freeze the page behind the overlay so scrolling doesn't leak through.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || !mounted) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject, contactEmail, message }),
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

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-[rgba(6,7,9,.72)] backdrop-blur-[6px] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[480px] my-auto bg-panel border border-borderHard rounded-[22px] shadow-[0_24px_60px_rgba(0,0,0,.55)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border">
          <div>
            <h2 id="feedback-title" className="font-bold text-[19px] tracking-tight">
              {status === "sent" ? "Thanks!" : "Send feedback"}
            </h2>
            <p className="font-mono text-[11px] text-muted mt-1">
              {status === "sent"
                ? "Your message is on its way."
                : "Found a bug or have an idea? Tell me about it."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-[34px] h-[34px] rounded-md border border-border flex items-center justify-center text-muted hover:text-ink hover:bg-panel2 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {status === "sent" ? (
          <div className="px-6 py-6 space-y-4">
            <p className="text-muted text-sm">
              I&apos;ll get back to you at{" "}
              <span className="text-ink font-mono text-[13px]">
                {contactEmail || accountEmail}
              </span>
              .
            </p>
            <button
              type="button"
              onClick={onClose}
              className="bg-mint text-bg font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-lg font-semibold hover:opacity-90 transition-opacity"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="px-6 py-5 space-y-4">
            <label className="block space-y-1.5">
              <span className={LABEL_CLASS}>Type</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                className={FIELD_CLASS}
              >
                {FEEDBACK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {FEEDBACK_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className={LABEL_CLASS}>Subject</span>
              <input
                ref={subjectRef}
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={150}
                placeholder="Short summary"
                className={FIELD_CLASS}
              />
            </label>

            <label className="block space-y-1.5">
              <span className={LABEL_CLASS}>Contact email</span>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                maxLength={254}
                placeholder="you@example.com"
                className={FIELD_CLASS}
              />
              <span className="block font-mono text-[10px] text-dim">
                Where the reply goes — prefilled from your account.
              </span>
            </label>

            <label className="block space-y-1.5">
              <span className={LABEL_CLASS}>Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                maxLength={5000}
                rows={5}
                placeholder="What happened, or what would you like to see?"
                className={`${FIELD_CLASS} resize-y min-h-[110px]`}
              />
            </label>

            {error && (
              <p className="text-sm text-pink" role="alert" aria-live="polite">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-xs uppercase tracking-widest text-muted hover:text-ink px-4 py-2.5 rounded-lg border border-border transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={status === "sending" || !message.trim()}
                className="bg-mint text-bg font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-lg font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {status === "sending" ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
