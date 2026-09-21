import { describe, expect, it } from "vitest";
import { hashPassword, normalizeEmail, verifyPassword } from "./localAuth";

describe("local employee credentials", () => {
  it("normalizes login email and stores only a verifiable scrypt hash", async () => {
    const password = "StrongPassword2026";
    const hash = await hashPassword(password);
    expect(normalizeEmail(" Employee@Example.COM ")).toBe("employee@example.com");
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("NotThePassword2026", hash)).resolves.toBe(false);
  });
});
