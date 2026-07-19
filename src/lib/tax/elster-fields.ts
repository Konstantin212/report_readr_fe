/**
 * Declarative description of the ELSTER Anlage KAP / KAP-INV lines Folio
 * emits.
 *
 * WHY THIS EXISTS. Until 2026-07-19 the app carried Zeile numbers that had
 * been derived informally, and three copies of the German captions (PDF,
 * values card, checklist) that could drift apart. Walking the live 2025 form
 * field-by-field showed the cost: what the app called "Z51 / Z52 —
 * ausländische Quellensteuer" are, on the real form, the Steuernummer and
 * income of a foreign FAMILY FOUNDATION (§15 AStG, section 12). The creditable
 * foreign tax is Zeile 41. A user who trusted the export would have declared a
 * foundation they do not have.
 *
 * Every `caption` below is copied verbatim from the live form. If you change
 * one, you are changing what a user types into a tax return — verify against
 * the form, not against memory.
 */

export type ElsterFieldKey =
  | "KAP_Z7" | "KAP_Z17" | "KAP_Z19" | "KAP_Z20" | "KAP_Z22" | "KAP_Z23"
  | "KAP_Z37" | "KAP_Z38" | "KAP_Z41"
  | "KAP_INV_S1_Z4" | "KAP_INV_S1_Z5" | "KAP_INV_S1_Z6" | "KAP_INV_S1_Z7" | "KAP_INV_S1_Z8"
  | "KAP_INV_S2_Z14" | "KAP_INV_S2_Z17" | "KAP_INV_S2_Z20" | "KAP_INV_S2_Z23" | "KAP_INV_S2_Z26";

/** How a line relates to another line's total.
 *  - `contained_in`: the form says "zusätzlich" / "darin enthaltene" — this
 *    line's magnitude is ALSO part of the parent's total.
 *  - `excluded_from`: the form says "ausschließlich" — this line is declared
 *    ONLY here and must never reach the parent. */
export type Inclusion =
  | { kind: "standalone" }
  | { kind: "contained_in"; parent: ElsterFieldKey }
  | { kind: "excluded_from"; parent: ElsterFieldKey };

export type ElsterField = {
  key: ElsterFieldKey;
  form: "KAP" | "KAP_INV";
  /** ELSTER's own section number in the left-hand navigation. */
  section: number;
  zeile: string;
  /** Verbatim German caption as printed on the form. */
  caption: string;
  precision: "whole_euro" | "euro_cent";
  /** `signed` lines may legitimately be negative; `magnitude` lines never are. */
  sign: "signed" | "magnitude";
  inclusion: Inclusion;
  /** Where the number comes from. `declared` lines are transcribed from a
   *  Steuerbescheinigung (§45a EStG) and are NOT recomputable from
   *  transactions — the withheld tax appears in no export. */
  source: "derived" | "declared";
};

export const KAP_FIELDS: ElsterField[] = [
  {
    key: "KAP_Z7", form: "KAP", section: 3, zeile: "7",
    caption: "Kapitalerträge",
    precision: "whole_euro", sign: "magnitude",
    inclusion: { kind: "standalone" }, source: "declared",
  },
  {
    key: "KAP_Z17", form: "KAP", section: 4, zeile: "17",
    caption:
      "In Anspruch genommener Sparer-Pauschbetrag, der auf die in der Anlage KAP nicht erklärten Kapitalerträge entfällt",
    precision: "whole_euro", sign: "magnitude",
    inclusion: { kind: "standalone" }, source: "declared",
  },
  {
    key: "KAP_Z19", form: "KAP", section: 5, zeile: "19",
    caption: "Ausländische Kapitalerträge (ohne Beträge laut den Zeilen 26a und 52)",
    precision: "whole_euro", sign: "signed",
    inclusion: { kind: "standalone" }, source: "derived",
  },
  {
    key: "KAP_Z20", form: "KAP", section: 5, zeile: "20",
    caption:
      "In den Zeilen 18 und 19 enthaltene Gewinne aus Aktienveräußerungen i. S. d. § 20 Abs. 2 Satz 1 Nr. 1 EStG",
    precision: "whole_euro", sign: "magnitude",
    inclusion: { kind: "contained_in", parent: "KAP_Z19" }, source: "derived",
  },
  {
    key: "KAP_Z22", form: "KAP", section: 5, zeile: "22",
    caption:
      "In den Zeilen 18 und 19 enthaltene Verluste ohne Verluste aus der Veräußerung von Aktien",
    precision: "whole_euro", sign: "magnitude",
    inclusion: { kind: "contained_in", parent: "KAP_Z19" }, source: "derived",
  },
  {
    key: "KAP_Z23", form: "KAP", section: 5, zeile: "23",
    caption:
      "In den Zeilen 18 und 19 enthaltene Verluste aus der Veräußerung von Aktien i. S. d. § 20 Abs. 2 Satz 1 Nr. 1 EStG",
    precision: "whole_euro", sign: "magnitude",
    inclusion: { kind: "contained_in", parent: "KAP_Z19" }, source: "derived",
  },
  {
    key: "KAP_Z37", form: "KAP", section: 8, zeile: "37",
    caption: "Kapitalertragsteuer",
    precision: "euro_cent", sign: "magnitude",
    inclusion: { kind: "standalone" }, source: "declared",
  },
  {
    key: "KAP_Z38", form: "KAP", section: 8, zeile: "38",
    caption: "Solidaritätszuschlag",
    precision: "euro_cent", sign: "magnitude",
    inclusion: { kind: "standalone" }, source: "declared",
  },
  {
    key: "KAP_Z41", form: "KAP", section: 8, zeile: "41",
    caption: "Anrechenbare noch nicht angerechnete ausländische Steuern",
    precision: "euro_cent", sign: "magnitude",
    inclusion: { kind: "standalone" }, source: "derived",
  },
];

export const KAP_INV_FIELDS: ElsterField[] = [
  ...([
    ["KAP_INV_S1_Z4", "4", "Aktienfonds i. S. d. § 2 Abs. 6 InvStG (vor Teilfreistellung)"],
    ["KAP_INV_S1_Z5", "5", "Mischfonds i. S. d. § 2 Abs. 7 InvStG (vor Teilfreistellung)"],
    ["KAP_INV_S1_Z6", "6", "Immobilienfonds i. S. d. § 2 Abs. 9 Satz 1 InvStG (vor Teilfreistellung und ohne Beträge laut Zeile 7)"],
    ["KAP_INV_S1_Z7", "7", "Auslands-Immobilienfonds i. S. d. § 2 Abs. 9 Satz 2 InvStG (vor Teilfreistellung)"],
    ["KAP_INV_S1_Z8", "8", "sonstigen Investmentfonds"],
  ] as const).map(([key, zeile, caption]): ElsterField => ({
    key, form: "KAP_INV", section: 1, zeile, caption,
    precision: "whole_euro", sign: "magnitude",
    inclusion: { kind: "standalone" }, source: "derived",
  })),
  ...([
    ["KAP_INV_S2_Z14", "14", "Aktienfonds i. S. d. § 2 Abs. 6 InvStG (vor Teilfreistellung)"],
    ["KAP_INV_S2_Z17", "17", "Mischfonds i. S. d. § 2 Abs. 7 InvStG (vor Teilfreistellung)"],
    ["KAP_INV_S2_Z20", "20", "Immobilienfonds i. S. d. § 2 Abs. 9 Satz 1 InvStG (vor Teilfreistellung und ohne Beträge laut Zeile 23)"],
    ["KAP_INV_S2_Z23", "23", "Auslands-Immobilienfonds i. S. d. § 2 Abs. 9 Satz 2 InvStG (vor Teilfreistellung)"],
    ["KAP_INV_S2_Z26", "26", "Sonstige Investmentfonds"],
  ] as const).map(([key, zeile, caption]): ElsterField => ({
    key, form: "KAP_INV", section: 2, zeile, caption,
    // Section 2 is "Gewinne UND Verluste" — a net figure that may be negative.
    precision: "whole_euro", sign: "signed",
    inclusion: { kind: "standalone" }, source: "derived",
  })),
];

export const ALL_ELSTER_FIELDS: ElsterField[] = [...KAP_FIELDS, ...KAP_INV_FIELDS];

const BY_KEY = new Map<ElsterFieldKey, ElsterField>(
  ALL_ELSTER_FIELDS.map((f) => [f.key, f]),
);

export function fieldFor(key: ElsterFieldKey): ElsterField {
  const f = BY_KEY.get(key);
  if (!f) throw new Error(`Unknown ELSTER field: ${key}`);
  return f;
}

/** Keys whose magnitudes are part of `parentKey`'s total. */
export function containedChildren(parentKey: ElsterFieldKey): ElsterFieldKey[] {
  return ALL_ELSTER_FIELDS
    .filter((f) => f.inclusion.kind === "contained_in" && f.inclusion.parent === parentKey)
    .map((f) => f.key);
}

/** Human-readable label used by the PDF, the values card and the checklist.
 *  Single source — three copies of these strings previously drifted. */
export function labelFor(key: ElsterFieldKey): string {
  const f = fieldFor(key);
  return `Z${f.zeile} — ${f.caption}`;
}
