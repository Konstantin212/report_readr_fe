import { describe, expect, it } from "vitest";

import { getEnabledAuthProviders } from "@/lib/auth/providers";

describe("auth provider visibility", () => {
  it("uses Google as the default production provider and only shows configured providers", () => {
    expect(
      getEnabledAuthProviders({
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
        GITHUB_CLIENT_ID: "",
        GITHUB_CLIENT_SECRET: "",
      }),
    ).toEqual([{ id: "google", label: "Continue with Google" }]);

    expect(
      getEnabledAuthProviders({
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
        GITHUB_CLIENT_ID: "github-id",
        GITHUB_CLIENT_SECRET: "github-secret",
      }),
    ).toEqual([
      { id: "google", label: "Continue with Google" },
      { id: "github", label: "Continue with GitHub" },
    ]);
  });
});
