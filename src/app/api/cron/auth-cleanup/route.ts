import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { hasValidCronSecret } from "@/lib/auth/cron";
import { runAuthCleanup } from "@/lib/auth/auth-cleanup";

export const maxDuration = 30;

export async function GET(req: Request) {
  if (!hasValidCronSecret(req)) {
    return new Response("unauthorized", { status: 401 });
  }

  const result = await runAuthCleanup(getDb(), {
    deleteEnabled: process.env.AUTH_CLEANUP_DELETE_ENABLED === "true",
  });

  return NextResponse.json(result);
}
