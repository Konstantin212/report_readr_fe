import { Card } from "./card";
import type { GermanTaxDraft } from "@/lib/tax/german-tax";

type ChecklistItem = {
  mark: "yes" | "no" | "warn";
  text: string;
};

function buildItems(draft: GermanTaxDraft): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { mark: "yes", text: "Anlage KAP attached" },
    {
      mark: draft.kapInv.present ? "yes" : "no",
      text: draft.kapInv.present
        ? "Anlage KAP-INV attached (you have ETF / Investmentfonds income)"
        : "Anlage KAP-INV NOT required (no ETF / fund income this year)",
    },
    { mark: "no", text: "Anlage KAP-BET NOT required for this filing" },
    {
      mark: draft.kap.Z4_kapInvAttached ? "yes" : "no",
      text: `KAP Zeile 4 checkbox ${draft.kap.Z4_kapInvAttached ? "SET" : "NOT set"} (KAP-INV beigefügt)`,
    },
    {
      mark: "yes",
      text: "KAP Zeile 17 = 0 (let ELSTER auto-allocate the Sparer-Pauschbetrag)",
    },
    {
      // Z19 being non-zero is normal for stock dividends or interest. Only
      // a zero value with KAP-INV present "should" hold for pure-ETF users;
      // anything else is just informational, not a warning.
      mark: "yes",
      text:
        draft.kap.lines.Z19.euros === 0
          ? "KAP Zeile 19 = 0 (no non-fund foreign capital income)"
          : `KAP Zeile 19 = ${draft.kap.lines.Z19.euros} (non-fund dividends + interest)`,
    },
  ];

  if (draft.kapInv.present) {
    if (draft.kapInv.section1.Z4_aktienfonds.euros > 0) {
      items.push({
        mark: "yes",
        text: `KAP-INV Section 1 Zeile 4 = ${draft.kapInv.section1.Z4_aktienfonds.euros} (Aktienfonds — equity-ETF distributions)`,
      });
    }
    if (draft.kapInv.section1.Z5_mischfonds.euros > 0) {
      items.push({
        mark: "yes",
        text: `KAP-INV Section 1 Zeile 5 = ${draft.kapInv.section1.Z5_mischfonds.euros} (Mischfonds)`,
      });
    }
    if (draft.kapInv.section1.Z8_sonstige.euros > 0) {
      items.push({
        mark: "warn",
        text: `KAP-INV Section 1 Zeile 8 = ${draft.kapInv.section1.Z8_sonstige.euros} (Sonstige — fund classification uncertain, verify with your Steuerberater)`,
      });
    }
  }

  return items;
}

function Mark({ mark }: { mark: ChecklistItem["mark"] }) {
  if (mark === "yes") return <span className="text-mint font-mono">✓</span>;
  if (mark === "no") return <span className="text-dim font-mono">✗</span>;
  return <span className="text-amber font-mono">!</span>;
}

export function PreSubmitChecklist({ draft }: { draft: GermanTaxDraft }) {
  const items = buildItems(draft);
  return (
    <Card className="space-y-2.5">
      <div className="flex justify-between items-baseline">
        <div className="font-semibold text-base">Pre-submission checklist</div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Tick each before clicking <span className="text-ink">Versenden</span>
        </div>
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-3 text-[12px]">
            <Mark mark={it.mark} />
            <span className={it.mark === "no" ? "text-dim" : "text-ink"}>{it.text}</span>
          </li>
        ))}
      </ul>
      <div className="font-mono text-[11px] text-amber bg-amber/10 border border-amber/25 rounded-md px-3 py-2">
        <strong>If ELSTER rejects a value</strong> with{" "}
        <em>&quot;Volle Geldbeträge müssen als Ziffernfolge ohne Dezimaltrenner eingetragen werden&quot;</em> —
        you typed cents. Re-enter using only the LARGE whole-euro number above (no comma, no period, no minus).
      </div>
    </Card>
  );
}
