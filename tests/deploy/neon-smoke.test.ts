import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { parseBrokerStatement } from "@/lib/brokers";
import { getDashboardSummary, getPortfolioSummary, getTaxDraft } from "@/lib/data/portfolio";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { sha256Hex } from "@/lib/imports/import-utils";
import { persistParsedImport } from "@/lib/imports/persistence";

const smokeUserId = `deploy-smoke:${Date.now()}`;

describe("deployment smoke against configured Postgres", () => {
  afterAll(async () => {
    if (process.env.DATABASE_URL) {
      await getDb().delete(user).where(eq(user.id, smokeUserId));
    }
  });

  it.skipIf(!process.env.DATABASE_URL)("persists an import and reads DB-backed dashboard, portfolio, and tax summaries", async () => {
    const db = getDb();
    await db.insert(user).values({
      id: smokeUserId,
      email: `${smokeUserId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const bytes = readFileSync(join(process.cwd(), "tests/fixtures/ibkr-activity.sample.csv"));
    const parsed = parseBrokerStatement({
      broker: "INTERACTIVE_BROKERS",
      fileName: "ibkr-activity.sample.csv",
      bytes,
      taxYear: 2024,
    });
    const fileHash = await sha256Hex(bytes);

    const result = await persistParsedImport({
      ownerUserId: smokeUserId,
      parsed,
      fileHash,
    });

    expect(result.persisted).toBe(true);
    expect(result.insertedEventCount).toBeGreaterThan(0);
    expect((await getDashboardSummary(smokeUserId)).storageMode).toBe("DATABASE");
    expect((await getPortfolioSummary(smokeUserId)).accounts).toHaveLength(1);
    expect((await getTaxDraft(smokeUserId, 2024)).draft.taxYear).toBe(2024);
  });
});
