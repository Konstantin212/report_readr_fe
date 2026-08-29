"use client";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { UPLOAD_INSTRUCTION_SECTIONS } from "@/lib/onboarding/broker-instructions";
import { InstructionBody } from "@/components/onboarding/instruction-copy";

/**
 * Always-reachable "how do I export a statement?" disclosure for `/upload`
 * (AC-OC2.1). Mounted as a SIBLING of the dropzone's `<label>`, never inside
 * it: any click within that label activates the hidden file input, so keeping
 * the trigger outside removes the hazard entirely instead of papering over it
 * with `stopPropagation` (AC-OC2.10).
 *
 * The open/closed state lives here rather than in `UploadDropzone` so toggling
 * re-renders only this leaf — the in-flight queue and progress counters are
 * provably untouched.
 */
export function ExportInstructions() {
  const [open, setOpen] = useState(false);
  // Scoped per instance so a second mount cannot collide on the panel id.
  const panelId = useId();
  return (
    <section className="bg-panel border border-border rounded-xl">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-ink hover:text-mint"
      >
        <span className="font-semibold text-sm">How do I export a statement?</span>
        <ChevronDown
          aria-hidden
          className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {/* Always in the DOM, hidden via the `hidden` attribute, so
          `aria-controls` always resolves and find-in-page still works. */}
      <div id={panelId} hidden={!open} className="px-4 pb-4 space-y-6 border-t border-border pt-4">
        {UPLOAD_INSTRUCTION_SECTIONS.map((s) => (
          <div key={s.id} className="space-y-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{s.badge}</div>
            <h3 className="font-semibold text-[15px]">{s.title}</h3>
            <div className="text-ink/90 leading-relaxed space-y-3">
              <InstructionBody section={s} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
