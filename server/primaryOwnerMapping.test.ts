import { describe, expect, it } from "vitest";

import { getUserByOpenId, upsertUser } from "./db";
import { ENV } from "./_core/env";

describe("primary owner TiDB mapping", () => {
  it("rehydrates the configured owner as the root Super Admin", async () => {
    expect(ENV.ownerOpenId).toBeTruthy();

    await upsertUser({
      openId: ENV.ownerOpenId,
      lastSignedIn: new Date(),
    });

    const owner = await getUserByOpenId(ENV.ownerOpenId);
    expect(owner).toMatchObject({
      openId: ENV.ownerOpenId,
      role: "super_admin",
      isSuperAdmin: true,
      storeId: null,
    });
  }, 30_000);
});
