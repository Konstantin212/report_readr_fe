import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "./setup";

export type AppSessionUser = {
  id: string;
  email: string;
  name?: string;
};

/**
 * Returns the current authenticated user, or null. The previous version
 * had an `AUTH_DEMO_MODE` env-var bypass that returned a synthetic user
 * with NO session validation when set in non-production. That's a
 * one-flag auth bypass — if the env var ever leaked into a prod-like
 * environment (preview deploys are NODE_ENV=production on Vercel, so
 * they were OK; the risk was a misconfigured prod env). Removed: the
 * cost of the dev convenience was greater than its value for a 5-user
 * app where signing in locally takes 3 seconds.
 */
export async function getCurrentUser(): Promise<AppSessionUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.email) {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function requireCurrentUser(): Promise<AppSessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  return user;
}
