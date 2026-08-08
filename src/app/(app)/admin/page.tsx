import Link from "next/link";

import { requireAdminUser } from "@/lib/auth/require-admin";
import { listAdminUsers } from "@/lib/data/admin-users";
import { Card } from "@/components/pulse/card";

type SP = Promise<{ page?: string }>;

/**
 * AC-3: paginated user list, most-recent signup first, each row linking
 * to the detail view (AC-3.5). Server component / direct Drizzle read —
 * matches settings/page.tsx's existing pattern (§5 of the design doc: no
 * `GET /api/admin/panel/users` route since nothing client-side needs to
 * re-fetch this outside a full page navigation).
 */
export default async function AdminUsersPage({ searchParams }: { searchParams: SP }) {
  await requireAdminUser();
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const { rows, totalCount, pageSize } = await listAdminUsers(page);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <main className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Admin — Users</h1>
        <div className="font-mono text-[11px] text-muted">
          {totalCount} account{totalCount === 1 ? "" : "s"}
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-widest text-dim">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Signed up</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Uploaded?</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  No users found.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-panel2">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${r.id}` as never} className="font-mono text-ink hover:underline">
                    {r.email}
                  </Link>
                </td>
                <td className="px-4 py-3">{r.name ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted">
                  {r.createdAt.toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-3">
                  {r.role === "admin" ? (
                    <span className="font-mono text-[10px] text-amber tracking-wider">ADMIN</span>
                  ) : (
                    <span className="font-mono text-[10px] text-dim tracking-wider">user</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.hasUploaded ? (
                    <span className="text-mint">●</span>
                  ) : (
                    <span className="text-dim">○</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 font-mono text-[11px]">
          {page > 1 ? (
            <Link href={`/admin?page=${page - 1}` as never} className="text-mint hover:underline">
              ← Prev
            </Link>
          ) : (
            <span className="text-dim">← Prev</span>
          )}
          <span className="text-muted">
            Page {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`/admin?page=${page + 1}` as never} className="text-mint hover:underline">
              Next →
            </Link>
          ) : (
            <span className="text-dim">Next →</span>
          )}
        </div>
      )}
    </main>
  );
}
