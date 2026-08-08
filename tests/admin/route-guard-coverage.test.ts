import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AC-2.5 structural choke-point test (admin-panel design doc §2/§4):
 * "every admin-panel route independently performs the server-side role
 * check... verifiable by a shared test helper, single enforced choke
 * point." Since this repo doesn't lean on middleware for this (see design
 * doc §2 — CVE-2025-29927 / next@^15.1.0 floor), the guarantee instead has
 * to be this source-grep: every page/layout file under
 * `src/app/(app)/admin/**` must call `requireAdminUser()`, and every API
 * route file under `src/app/api/admin/panel/**` must call
 * `requireAdminApi()` — so a future route that forgets the call fails CI
 * rather than silently shipping unguarded.
 *
 * This test is intentionally NOT vacuously true: it also asserts each
 * glob actually matched at least one file, so a typo'd path (or a
 * refactor that moves the admin panel elsewhere without updating this
 * test) fails loudly instead of the coverage check silently checking
 * zero files.
 */

const ROOT = join(__dirname, "..", "..");

function listFilesRecursive(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir, { recursive: true }) as string[];
  } catch {
    return [];
  }
  return entries.map((e) => join(dir, e));
}

function findFiles(dir: string, predicate: (relativePath: string) => boolean): string[] {
  return listFilesRecursive(dir).filter((absPath) => predicate(absPath.slice(dir.length + 1)));
}

describe("admin-panel route guard coverage (AC-2.5)", () => {
  it("every admin-panel page/layout under src/app/(app)/admin calls requireAdminUser()", () => {
    const dir = join(ROOT, "src", "app", "(app)", "admin");
    const files = findFiles(dir, (rel) => /(^|\/)(page|layout)\.tsx$/.test(rel));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      expect(contents, `${file} must call requireAdminUser()`).toMatch(/requireAdminUser\s*\(/);
    }
  });

  it("every admin-panel API route under src/app/api/admin/panel calls requireAdminApi(), except the documented impersonate/stop exit path", () => {
    const dir = join(ROOT, "src", "app", "api", "admin", "panel");
    const files = findFiles(dir, (rel) => /(^|\/)route\.ts$/.test(rel));

    expect(files.length).toBeGreaterThan(0);

    // impersonate/stop is the one documented exception (design doc §8.4):
    // during impersonation, the caller's session role is the *target's*,
    // not "admin", so requireAdminApi() would itself always reject the
    // legitimate exit call. It guards instead on
    // `session.session.impersonatedBy` being truthy.
    const EXEMPT_SUFFIX = join("impersonate", "stop", "route.ts");

    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      if (file.endsWith(EXEMPT_SUFFIX)) {
        expect(contents, `${file} must guard on session.session.impersonatedBy`).toMatch(/impersonatedBy/);
        continue;
      }
      expect(contents, `${file} must call requireAdminApi()`).toMatch(/requireAdminApi\s*\(/);
    }
  });
});
