import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminUser } from "@/lib/auth/require-admin";
import { getAdminUserDetail } from "@/lib/data/admin-users";
import { Card } from "@/components/pulse/card";
import { SettingRow } from "@/components/pulse/setting-row";
import { EditUserForm } from "@/components/admin/edit-user-form";
import { DeleteUserButton } from "@/components/admin/delete-user-button";
import { ImpersonateButton } from "@/components/admin/impersonate-button";

/**
 * AC-3.5 detail view — entry point for edit (AC-6), delete (AC-4), and
 * impersonate (AC-5). Server component reads Drizzle directly; the three
 * actions below are small client leaf components (react-best-practices:
 * push "use client" as far down the tree as possible).
 */
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminUser();
  const { id } = await params;
  const target = await getAdminUserDetail(id);

  if (!target) {
    notFound();
  }

  const isSelf = target.id === admin.id;

  return (
    <main className="space-y-4 max-w-2xl">
      <div>
        <Link href={"/admin" as never} className="font-mono text-[11px] text-muted hover:text-ink">
          ← All users
        </Link>
      </div>

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{target.email}</h1>
        {isSelf && <span className="font-mono text-[10px] text-dim tracking-wider">THIS IS YOU</span>}
      </div>

      <Card>
        <div className="font-semibold text-base mb-3">Account</div>
        <SettingRow label="User ID" value={target.id} />
        <SettingRow label="Signed up" value={target.createdAt.toISOString().slice(0, 10)} />
        <SettingRow label="Role" value={target.role === "admin" ? "admin" : "user"} />
        <SettingRow label="Uploaded data?" value={target.hasUploaded ? "Yes" : "No"} last />
      </Card>

      <Card>
        <div className="font-semibold text-base mb-3">Edit</div>
        <EditUserForm user={target} isSelf={isSelf} />
      </Card>

      <Card>
        <div className="font-semibold text-base mb-3">Actions</div>
        <div className="flex flex-wrap gap-2">
          {!isSelf && <ImpersonateButton userId={target.id} userEmail={target.email} />}
          {!isSelf ? (
            <DeleteUserButton userId={target.id} userEmail={target.email} />
          ) : (
            <span className="font-mono text-[11px] text-dim px-3 py-1.5">
              You can&apos;t delete or impersonate your own account.
            </span>
          )}
        </div>
      </Card>
    </main>
  );
}
