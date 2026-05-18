import Decimal from "decimal.js";

export function decimal(value: string | number | Decimal | null | undefined): Decimal {
  if (value instanceof Decimal) {
    return value;
  }

  if (value === null || value === undefined || value === "") {
    return new Decimal(0);
  }

  return new Decimal(value);
}

export function isPositive(value: string | number | Decimal | null | undefined): boolean {
  return decimal(value).gt(0);
}

export function isNegative(value: string | number | Decimal | null | undefined): boolean {
  return decimal(value).lt(0);
}

export function moneyString(value: Decimal): string {
  return value.isZero() ? "0" : value.toString();
}

export function addDecimalStrings(values: Array<string | number | Decimal | null | undefined>): string {
  const total = values.reduce<Decimal>((sum, value) => sum.plus(decimal(value)), new Decimal(0));
  return moneyString(total);
}
