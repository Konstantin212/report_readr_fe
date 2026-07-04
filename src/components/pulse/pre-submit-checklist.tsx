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
        ? "ADD Anlage KAP-INV to the ELSTER form list (you have ETF / Investmentfonds income — there is no KAP checkbox for this)"
        : "Anlage KAP-INV NOT required (no ETF / fund income this year)",
    },
    { mark: "no", text: "Anlage KAP-BET NOT required for this filing" },
    {
      mark: draft.kap.Z4_guenstigerpruefung ? "yes" : "no",
      text: draft.kap.Z4_guenstigerpruefung
        ? "KAP Zeile 4 (Antrag auf Günstigerprüfung): TICK — your marginal rate is likely below 25 %, so regular income-tax rates beat the Abgeltungsteuer. All capital income must then be declared."
        : "KAP Zeile 4 (Antrag auf Günstigerprüfung): leave UNCHECKED — only worthwhile if your marginal income-tax rate is below 25 %.",
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
          : `KAP Zeile 19 = ${draft.kap.lines.Z19.euros} (ausländische Kapitalerträge, gesamt)`,
    },
  ];

  // Stock-sale gain/loss breakout (§20 Abs.6 — separate ELSTER lines, all
  // non-negative). Only surfaced when there's something to show.
  if (draft.kap.lines.Z20.euros > 0) {
    items.push({
      mark: "yes",
      text: `KAP Zeile 20 = ${draft.kap.lines.Z20.euros} (Gewinne aus Aktienveräußerungen)`,
    });
  }
  if (draft.kap.lines.Z23.euros > 0) {
    items.push({
      mark: "warn",
      text: `KAP Zeile 23 = ${draft.kap.lines.Z23.euros} (Verluste aus Aktienveräußerungen — only offset stock gains, §20 Abs.6 S.4)`,
    });
  }
  if (draft.kap.lines.Z22.euros > 0) {
    items.push({
      mark: "warn",
      text: `KAP Zeile 22 = ${draft.kap.lines.Z22.euros} (Verluste ohne Aktienveräußerungen)`,
    });
  }
  if (draft.kap.lines.Z51.euros > 0) {
    items.push({
      mark: "yes",
      text: `KAP Zeile 51 = ${draft.kap.lines.Z51.euros} (ausländische Quellensteuer, brutto)`,
    });
  }
  // Unused stock losses only survive into future years if the loss
  // carryforward is formally requested on the Hauptvordruck.
  if (draft.kap.stockLossCarryforward.euros > 0) {
    items.push({
      mark: "warn",
      text:
        `TICK "Erklärung zur Feststellung des verbleibenden Verlustvortrags" on the Hauptvordruck — `
        + `~€${draft.kap.stockLossCarryforward.euros} of stock-sale losses exceed this year's stock gains and `
        + `would otherwise be lost (§20 Abs.6 S.4: they only ever offset future stock gains).`,
    });
  }

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
