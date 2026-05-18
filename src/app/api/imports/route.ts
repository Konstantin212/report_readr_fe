import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { parseBrokerStatement } from "@/lib/brokers";
import { detectBrokerFromFileName, sha256Hex, summarizeParsedImport } from "@/lib/imports/import-utils";
import { persistParsedImport } from "@/lib/imports/persistence";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const taxYearValue = Number(formData.get("taxYear") ?? new Date().getFullYear());

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a statement file." }, { status: 400 });
    }

    if (!Number.isInteger(taxYearValue)) {
      return NextResponse.json({ error: "Tax year must be a valid year." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const broker = detectBrokerFromFileName(file.name);
    const fileHash = await sha256Hex(bytes);
    const parsed = parseBrokerStatement({
      broker,
      fileName: file.name,
      bytes,
      taxYear: taxYearValue,
    });
    const persistence = await persistParsedImport({
      ownerUserId: user.id,
      parsed,
      fileHash,
    });
    const summary = summarizeParsedImport(parsed, fileHash);

    return NextResponse.json({
      summary: {
        ...summary,
        persisted: persistence.persisted,
        duplicate: persistence.duplicate,
        insertedEventCount: persistence.insertedEventCount,
        duplicateEventCount: persistence.duplicateEventCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
