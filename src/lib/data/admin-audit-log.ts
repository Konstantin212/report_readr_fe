import { getDb } from "@/lib/db/client";
import { adminAuditLog } from "@/lib/db/schema";

export type AdminAuditAction = "ACCOUNT_DELETE" | "ACCOUNT_EDIT" | "IMPERSONATION_START" | "IMPERSONATION_END";

export type WriteAuditLogParams = {
  action: AdminAuditAction;
  adminUserId: string;
  adminEmailSnapshot: string;
  targetUserId: string;
  targetEmailSnapshot: string;
  /** Small structured diff only — see the data-minimization doc-comment on schema.ts's adminAuditLog. */
  detail?: Record<string, unknown> | null;
  /** Links an IMPERSONATION_END row back to its IMPERSONATION_START row. */
  relatedActionId?: string | null;
};

/**
 * One shared insert path for all four admin-panel action types
 * (ACCOUNT_DELETE, ACCOUNT_EDIT, IMPERSONATION_START, IMPERSONATION_END)
 * — admin-panel design doc §3.4/§7.3/§8/§9.5. Append-only: there is
 * deliberately no update/delete export in this module.
 *
 * Callers are responsible for the deliberate write-ordering asymmetry
 * documented per action type in the design doc (e.g. §7.3 step 3:
 * deletion happens first, and if this write then fails, the caller must
 * still report the primary action as successful — never roll it back or
 * fail the response because logging failed). This function itself just
 * does the insert; it throws on failure like any other DB call, and
 * callers decide how to handle that per their own ordering contract.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<{ id: string }> {
  const db = getDb();
  const [row] = await db
    .insert(adminAuditLog)
    .values({
      action: params.action,
      adminUserId: params.adminUserId,
      adminEmailSnapshot: params.adminEmailSnapshot,
      targetUserId: params.targetUserId,
      targetEmailSnapshot: params.targetEmailSnapshot,
      detail: params.detail ?? null,
      relatedActionId: params.relatedActionId ?? null,
    })
    .returning({ id: adminAuditLog.id });

  return row;
}
