import { requireCurrentUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { UploadDropzone } from "@/components/pulse/upload-dropzone";

export default async function UploadPage() {
  const user = await requireCurrentUser();
  const recent = await getDb()
    .select()
    .from(imports)
    .where(eq(imports.ownerUserId, user.id))
    .orderBy(desc(imports.createdAt))
    .limit(20);

  // Strip Date objects so the client component receives JSON-serializable props
  const initial = recent.map(r => ({
    id: r.id,
    fileName: r.fileName,
    eventCount: r.eventCount,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));

  return <UploadDropzone recent={initial} />;
}
