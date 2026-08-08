"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type EditableAdminUser = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
};

/**
 * AC-6 edit form. `name`/`email`/`role` are the only editable fields —
 * matches the API's `.strict()` body shape (§9). Changing email warns
 * the admin inline that it re-triggers verification + revokes the
 * target's other sessions (AC-6.2) since that's a real behavioral
 * consequence, not just a data change.
 */
export function EditUserForm({ user, isSelf }: { user: EditableAdminUser; isSelf: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<"admin" | "user">(user.role === "admin" ? "admin" : "user");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      const body: Record<string, string> = {};
      if (name !== (user.name ?? "")) body.name = name;
      if (emailChanged) body.email = email.trim().toLowerCase();
      if (role !== (user.role === "admin" ? "admin" : "user")) body.role = role;

      if (Object.keys(body).length === 0) {
        setPending(false);
        return;
      }

      const res = await fetch(`/api/admin/panel/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resBody.error ?? `HTTP ${res.status}`);
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="admin-edit-name" className="font-mono text-[10px] text-dim uppercase tracking-widest">
          Name
        </label>
        <input
          id="admin-edit-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full bg-panel2 border border-borderHard rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="admin-edit-email" className="font-mono text-[10px] text-dim uppercase tracking-widest">
          Email
        </label>
        <input
          id="admin-edit-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full bg-panel2 border border-borderHard rounded-md px-3 py-2 text-sm font-mono"
        />
        {emailChanged && (
          <div className="mt-1 text-[11px] text-amber">
            Changing the email marks it unverified and signs the user out of other sessions until they verify it.
          </div>
        )}
      </div>
      <div>
        <label htmlFor="admin-edit-role" className="font-mono text-[10px] text-dim uppercase tracking-widest">
          Role
        </label>
        <select
          id="admin-edit-role"
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "user")}
          disabled={isSelf && user.role === "admin"}
          className="mt-1 w-full bg-panel2 border border-borderHard rounded-md px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        {isSelf && user.role === "admin" && (
          <div className="mt-1 text-[11px] text-dim">You can&apos;t change your own role here.</div>
        )}
      </div>
      {error && (
        <div className="px-3 py-2 rounded-md bg-bad/10 border border-bad/30 text-bad text-sm font-mono">{error}</div>
      )}
      {success && !error && <div className="text-mint text-sm">Saved.</div>}
      <button
        type="submit"
        disabled={pending}
        className="bg-mint text-bg font-mono text-[11px] uppercase tracking-widest px-4 py-2 rounded-md font-semibold disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
