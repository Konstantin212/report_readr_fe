import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "./schema";

let db: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl && process.env.VERCEL === "1") {
      throw new Error("DATABASE_URL is required on Vercel.");
    }

    db = drizzle(neon(databaseUrl ?? "postgresql://build:build@localhost:5432/build?sslmode=disable"), { schema });
  }

  return db;
}
