import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { ingestParsedImport } from "@/lib/imports/ingest";

export async function POST(req: Request) {
  const user = await requireCurrentUser();
  const body = await req.json();
  try {
    const summary = await ingestParsedImport(user.id, body);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
