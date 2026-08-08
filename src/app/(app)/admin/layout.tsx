import { requireAdminUser } from "@/lib/auth/require-admin";

/**
 * Single `requireAdminUser()` call for the whole `/admin/*` subtree
 * (admin-panel design doc §5) — belt, not the enforced boundary by
 * itself: Next.js layouts wrap same-segment pages but not API routes,
 * so every mutating route under `src/app/api/admin/panel/**` also calls
 * `requireAdminApi()` independently (AC-2.5, verified by
 * tests/admin/route-guard-coverage.test.ts).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminUser();
  return <>{children}</>;
}
