import type { ImportSummary } from "@/lib/imports/import-utils";

export const LOCAL_IMPORTS_STORAGE_KEY = "portfolio-tax:last-imports";

export type StoredImportSummary = ImportSummary & {
  importedAt: string;
};

export function mergeImportSummaries(
  existing: StoredImportSummary[],
  incoming: StoredImportSummary,
  limit = 10,
): StoredImportSummary[] {
  return [incoming, ...existing.filter((summary) => summary.fileHash !== incoming.fileHash)].slice(0, limit);
}

export function readImportSummaries(): StoredImportSummary[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(LOCAL_IMPORTS_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.filter(isStoredImportSummary) : [];
  } catch {
    return [];
  }
}

export function saveImportSummary(summary: ImportSummary): StoredImportSummary[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storedSummary: StoredImportSummary = {
    ...summary,
    importedAt: new Date().toISOString(),
  };

  const nextSummaries = mergeImportSummaries(readImportSummaries(), storedSummary);
  try {
    window.localStorage.setItem(LOCAL_IMPORTS_STORAGE_KEY, JSON.stringify(nextSummaries));
    window.dispatchEvent(new Event("portfolio-imports-updated"));
  } catch {
    return [];
  }

  return nextSummaries;
}

function isStoredImportSummary(value: unknown): value is StoredImportSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredImportSummary>;
  return (
    typeof candidate.broker === "string" &&
    typeof candidate.accountNumber === "string" &&
    typeof candidate.fileName === "string" &&
    typeof candidate.fileHash === "string" &&
    typeof candidate.taxYear === "number" &&
    typeof candidate.eventCount === "number" &&
    typeof candidate.importedAt === "string"
  );
}
