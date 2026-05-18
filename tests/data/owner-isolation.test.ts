import { describe, expect, it } from "vitest";

import { filterOwnerRows } from "@/lib/data/owner-isolation";

describe("owner isolation helpers", () => {
  it("returns only rows owned by the current authenticated user", () => {
    expect(
      filterOwnerRows("user-a", [
        { id: "a-import", ownerUserId: "user-a" },
        { id: "b-import", ownerUserId: "user-b" },
      ]),
    ).toEqual([{ id: "a-import", ownerUserId: "user-a" }]);
  });
});
