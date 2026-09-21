import { describe, expect, it, vi } from "vitest";
import { sdk } from "./_core/sdk";
import * as db from "./db";

describe("independent local authentication sessions", () => {
  it("creates and verifies a local JWT session", async () => {
    const token = await sdk.createSessionToken("local_test_user", { name: "Local Test User" });
    await expect(sdk.verifySession(token)).resolves.toEqual({
      openId: "local_test_user",
      name: "Local Test User",
    });
  });

  it("rejects an expired JWT session", async () => {
    const token = await sdk.signSession(
      { openId: "local_test_user", name: "Local Test User" },
      { expiresInMs: -1000 },
    );
    await expect(sdk.verifySession(token)).resolves.toBeNull();
  });

  it("does not synchronize a valid local-session token through an external identity provider", async () => {
    vi.spyOn(db, "getUserByOpenId").mockResolvedValue(undefined);
    const token = await sdk.createSessionToken("local_missing_user", { name: "Missing Local User" });
    const request = {
      headers: { cookie: `app_session_id=${token}` },
    } as Parameters<typeof sdk.authenticateRequest>[0];
    await expect(sdk.authenticateRequest(request)).rejects.toThrow("User not found");
  });
});
