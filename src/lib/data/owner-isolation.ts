export type OwnerScopedRow = {
  ownerUserId: string;
};

export function filterOwnerRows<T extends OwnerScopedRow>(ownerUserId: string, rows: T[]): T[] {
  return rows.filter((row) => row.ownerUserId === ownerUserId);
}
