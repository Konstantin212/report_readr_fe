import { Card } from "./card";
import type { GermanTaxDraft, ZeileValue } from "@/lib/tax/german-tax";

const KAP_LABELS = {
  Z17: "Z17 — Sparer-Pauschbetrag gegen nicht-KAP Erträge",
  Z19: "Z19 — Kapitalerträge gesamt",
  Z20: "Z20 — davon ausländisch",
  Z22: "Z22 — Gewinne aus Aktienveräußerungen (netto)",
  Z41: "Z41 — Bereits gezahlte Abgeltungsteuer",
  Z51: "Z51 — Ausländische Quellensteuer (brutto)",
  Z52: "Z52 — Anrechenbare ausl. Quellensteuer (gekappt)",
} as const;

const KAP_INV_S1_LABELS = {
  Z4_aktienfonds: "Z4 — Aktienfonds",
  Z5_mischfonds: "Z5 — Mischfonds",
  Z6_immo_inland: "Z6 — Inländische Immobilienfonds",
  Z7_immo_ausland: "Z7 — Auslands-Immobilienfonds",
  Z8_sonstige: "Z8 — Sonstige Investmentfonds",
} as const;

const KAP_INV_S2_LABELS = {
  Z14_aktienfonds: "Z14 — Aktienfonds",
  Z17_mischfonds: "Z17 — Mischfonds",
  Z20_immo_inland: "Z20 — Inländische Immobilienfonds",
  Z23_immo_ausland: "Z23 — Auslands-Immobilienfonds",
  Z26_sonstige: "Z26 — Sonstige Investmentfonds",
} as const;

function ZeileRow({ label, value }: { label: string; value: ZeileValue }) {
  const isZero = value.cents === "0.00";
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-border/40 last:border-0">
      <span className={`text-[12px] ${isZero ? "text-dim" : "text-ink"}`}>{label}</span>
      <span className="flex items-baseline gap-2">
        <span className={`font-mono text-base ${isZero ? "text-dim" : "text-ink font-semibold"}`}>
          {value.euros}
        </span>
        {!isZero && (
          <span className="font-mono text-[10px] text-muted">actual €{value.cents}</span>
        )}
      </span>
    </div>
  );
}

function CheckboxRow({ label, set }: { label: string; set: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-border/40 last:border-0">
      <span className="text-[12px] text-ink">{label}</span>
      <span className={`font-mono text-[11px] uppercase tracking-wider ${set ? "text-mint" : "text-dim"}`}>
        {set ? "☑ SET CHECKBOX" : "☐ leave blank"}
      </span>
    </div>
  );
}

export function ElsterValuesCard({ draft }: { draft: GermanTaxDraft }) {
  const s1Keys = Object.keys(KAP_INV_S1_LABELS) as Array<keyof typeof KAP_INV_S1_LABELS>;
  const s2Keys = Object.keys(KAP_INV_S2_LABELS) as Array<keyof typeof KAP_INV_S2_LABELS>;

  return (
    <Card className="space-y-3">
      <div className="flex justify-between items-baseline">
        <div className="font-semibold text-base">ELSTER values · Steuerjahr {draft.taxYear}</div>
        <div
          className="font-mono text-[10px] text-amber uppercase tracking-widest cursor-help"
          title='ELSTER rejects "127,30" with: "Volle Geldbeträge müssen als Ziffernfolge ohne Dezimaltrenner eingetragen werden." Enter the LARGE whole-euro number only.'
        >
          Whole euros · no decimals ⓘ
        </div>
      </div>

      {draft.warnings.length > 0 && (
        <div className="font-mono text-[11px] text-amber bg-amber/10 border border-amber/25 rounded-md px-3 py-2 space-y-1">
          {draft.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1">
          Anlage KAP
        </div>
        <CheckboxRow
          label="Z4 — Anlage KAP-INV ist beigefügt"
          set={draft.kap.Z4_kapInvAttached}
        />
        {(Object.keys(KAP_LABELS) as Array<keyof typeof KAP_LABELS>).map((k) => (
          <ZeileRow key={k} label={KAP_LABELS[k]} value={draft.kap.lines[k]} />
        ))}
      </div>

      {draft.kapInv.present && (
        <>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1">
              Anlage KAP-INV · Section 1 (Distributions)
            </div>
            {s1Keys.map((k) => (
              <ZeileRow key={k} label={KAP_INV_S1_LABELS[k]} value={draft.kapInv.section1[k]} />
            ))}
          </div>

          {s2Keys.some((k) => draft.kapInv.section2[k].cents !== "0.00") && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1">
                Anlage KAP-INV · Section 2 (Sale gains)
              </div>
              {s2Keys.map((k) => (
                <ZeileRow key={k} label={KAP_INV_S2_LABELS[k]} value={draft.kapInv.section2[k]} />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
