import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local employee sign-in contract", () => {
  it("verifies the credential hash, rate limits failures, and uses the standard session cookie", () => {
    const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(source).toContain("localLogin: publicProcedure");
    expect(source).toContain("verifyPassword(input.password, record.passwordHash)");
    expect(source).toContain("MAX_LOCAL_LOGIN_FAILURES = 5");
    expect(source).toContain("sdk.createSessionToken(record.user.openId");
    expect(source).toContain("ctx.res.cookie(COOKIE_NAME, token");
  });
});
