import { Fragment, type ReactNode } from "react";
import type { CopySpan, InstructionSection } from "@/lib/onboarding/broker-instructions";

/**
 * Presentational renderer for the shared instruction copy. No `"use client"`
 * directive on purpose — it has no hooks, state or event handlers, so it
 * adopts whichever environment imports it. Both consumers today (the welcome
 * tour and the `/upload` disclosure) happen to be client components; a server
 * one would work unchanged.
 *
 * Index keys are safe here: the span arrays are module-level constants in
 * `broker-instructions.ts` and never reorder.
 */
export function Spans({ spans }: { spans: CopySpan[] }): ReactNode {
  return (
    <>
      {spans.map((span, i) => {
        if (typeof span === "string") return <Fragment key={i}>{span}</Fragment>;
        if (span.em === "strong") return <b key={i}>{span.t}</b>;
        if (span.em === "code") {
          return (
            <code key={i} className="font-mono text-[12px] bg-panel2 px-1.5 py-0.5 rounded">
              {span.t}
            </code>
          );
        }
        const external = span.href.startsWith("http");
        return (
          <a
            key={i}
            href={span.href}
            className="text-mint underline"
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {span.t}
          </a>
        );
      })}
    </>
  );
}

/**
 * A section's body with NO surrounding chrome (AC-OC2.8) — the tour's
 * `GuideCard` accent bar and the upload page's panel each supply their own.
 */
export function InstructionBody({ section }: { section: InstructionSection }): ReactNode {
  return (
    <>
      {section.lead && (
        <p>
          <Spans spans={section.lead} />
        </p>
      )}
      <ol className="space-y-2.5 list-decimal pl-5">
        {section.steps.map((step, i) => (
          <li key={i}>
            <Spans spans={step} />
          </li>
        ))}
      </ol>
      {section.notes.map((note, i) => (
        <p key={i}>
          <Spans spans={note} />
        </p>
      ))}
      {section.footnote && (
        <p className="font-mono text-[11px] text-dim leading-relaxed pt-2">
          <Spans spans={section.footnote} />
        </p>
      )}
    </>
  );
}
