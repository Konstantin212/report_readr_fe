import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { getAuthorizedEmails, isEmailAuthorized } from "./allowlist";
import { getDb } from "@/lib/db/client";

function getAuthSecret(): string {
  if (process.env.BETTER_AUTH_SECRET) {
    return process.env.BETTER_AUTH_SECRET;
  }

  if (process.env.VERCEL === "1") {
    throw new Error("BETTER_AUTH_SECRET is required on Vercel.");
  }

  return "local-development-only-secret-replace-before-deploy";
}

function getBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

function getTrustedOrigins(): string[] {
  return [getBaseUrl(), process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined].filter(Boolean) as string[];
}

export const auth = betterAuth({
  secret: getAuthSecret(),
  baseURL: getBaseUrl(),
  trustedOrigins: getTrustedOrigins(),
  database: drizzleAdapter(getDb(), {
    provider: "pg",
  }),
  socialProviders: {
    google:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }
        : undefined,
    github:
      process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
        ? {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }
        : undefined,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const allowlist = getAuthorizedEmails();
          if (!isEmailAuthorized(user.email, allowlist)) {
            throw new Error("Email is not authorized for this private app.");
          }

          return { data: user };
        },
      },
    },
  },
});
