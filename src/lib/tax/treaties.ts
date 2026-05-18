// Country ISO → max foreign WHT eligible for German offset, per § 34c EStG + DBA.
// Source: standard treaty rates for portfolio investment income.
export const TREATY_CAP: Record<string, number> = {
  US: 0.15, GB: 0.15, FR: 0.15, CH: 0.15, NL: 0.15,
  // unlisted countries default to 0.15 in the builder
};

export const DEFAULT_TREATY_CAP = 0.15;
