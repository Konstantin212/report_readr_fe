import { getAuthorizedEmails, isEmailAuthorized } from "./allowlist";

export type AppSessionUser = {
  id: string;
  email: string;
  name?: string;
};

export function isDemoAuthEnabled(): boolean {
  return process.env.AUTH_DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
}

export function getDemoUser(): AppSessionUser | null {
  if (!isDemoAuthEnabled()) {
    return null;
  }

  const email = process.env.AUTH_DEMO_EMAIL ?? getAuthorizedEmails()[0];
  if (!email || !isEmailAuthorized(email, getAuthorizedEmails())) {
    return null;
  }

  return {
    id: `demo:${email}`,
    email,
    name: "Demo investor",
  };
}
