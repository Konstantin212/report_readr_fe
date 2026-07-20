/*
 * Shared dark canvas for every authored preview.
 *
 * WHY EVERY PREVIEW NEEDS THIS: the preview harness sets `body{background:#fff}`
 * in an inline <style> that comes AFTER the stylesheet links, so it wins over
 * the app's own `body{background:#0b0d10}`. Folio is a dark-only design system
 * — on a white canvas its muted text (58% ink), ghost buttons and hairline
 * borders are invisible or unreadable, which would teach the design agent the
 * wrong look.
 *
 * So each preview paints its own background rather than relying on the page.
 * This is also more honest: it is what a real Folio screen does.
 *
 * NOT exported from the bundle — this file lives only in .design-sync/previews
 * and is inlined into the compiled preview by esbuild.
 */
import type { ReactNode } from "react";

export function Frame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-bg text-ink p-6 ${className}`}>{children}</div>
  );
}
