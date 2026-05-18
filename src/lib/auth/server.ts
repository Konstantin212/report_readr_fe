import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "./setup";
import { getDemoUser, type AppSessionUser } from "./demo-session";

export async function getCurrentUser(): Promise<AppSessionUser | null> {
  const demoUser = getDemoUser();
  if (demoUser) {
    return demoUser;
  }

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
