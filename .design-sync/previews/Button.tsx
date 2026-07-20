import { Button } from "report-readr-fe";
import { Frame } from "./_frame";

/** The four variants, side by side — the primary appearance axis. */
export function Variants() {
  return (
    <Frame>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary">Import statement</Button>
        <Button variant="secondary">Export CSV</Button>
        <Button variant="outline">Edit holdings</Button>
        <Button variant="ghost">Cancel</Button>
      </div>
    </Frame>
  );
}

/** Disabled — the one state that renders statically. */
export function Disabled() {
  return (
    <Frame>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled>
          Uploading…
        </Button>
        <Button variant="secondary" disabled>
          Export CSV
        </Button>
        <Button variant="outline" disabled>
          Edit holdings
        </Button>
      </div>
    </Frame>
  );
}

/** In context: the primary action paired with a dismissive one. */
export function InContext() {
  return (
    <Frame>
      <div className="bg-panel border border-border rounded-[22px] p-[22px] max-w-md">
        <div className="font-semibold text-sm text-ink">Delete this import?</div>
        <div className="text-[13px] text-muted mt-1.5">
          47 transactions from Interactive Brokers will be removed. Positions and
          realised gains recompute automatically.
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="primary">Delete import</Button>
          <Button variant="ghost">Keep it</Button>
        </div>
      </div>
    </Frame>
  );
}
