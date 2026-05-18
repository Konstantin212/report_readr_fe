export type AuthProviderId = "google" | "github";

export type AuthProviderLink = {
  id: AuthProviderId;
  label: string;
};

type AuthProviderEnv = Partial<Pick<
  Record<string, string | undefined>,
  "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET"
>>;

export function getEnabledAuthProviders(env?: AuthProviderEnv): AuthProviderLink[] {
  const source = env ?? {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  };
  const providers: AuthProviderLink[] = [];

  if (source.GOOGLE_CLIENT_ID && source.GOOGLE_CLIENT_SECRET) {
    providers.push({ id: "google", label: "Continue with Google" });
  }

  if (source.GITHUB_CLIENT_ID && source.GITHUB_CLIENT_SECRET) {
    providers.push({ id: "github", label: "Continue with GitHub" });
  }

  return providers;
}
