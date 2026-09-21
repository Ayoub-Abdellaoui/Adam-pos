import { describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { appRouter } from "./routers";
import { enrollLocalCredentials, hashPassword, isValidLocalPassword, normalizeEmail, verifyPassword } from "./localAuth";

function selectChain<T>(rows: T[]) {
  return {
    from: () => ({
      where: () => ({ limit: async () => rows }),
      for: async () => rows,
    }),
  };
}

function setupTransaction(existingEmails: Array<{ userId: number; email: string }> = []) {
  const inserted: Array<Record<string, unknown>> = [];
  const tx = {
    select: vi.fn()
      .mockReturnValueOnce(selectChain([{ id: 42, name: "Existing User" }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain(existingEmails)),
    insert: vi.fn(() => ({ values: vi.fn(async (value: Record<string, unknown>) => { inserted.push(value); }) })),
  };
  getDb.mockResolvedValue({ transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) });
  return { inserted };
}

describe("local account enrollment", () => {
  it("enrolls an existing user without changing its user ID and stores only a hash", async () => {
    const { inserted } = setupTransaction();
    const password = "StrongPassword2026";
    const result = await enrollLocalCredentials({ userId: 42, firstName: "Existing", lastName: "User", email: " User@Example.COM ", password });
    expect(result).toMatchObject({ userId: 42, email: "user@example.com" });
    expect(inserted[0]).toMatchObject({ userId: 42, email: "user@example.com", firstName: "Existing", lastName: "User" });
    expect(inserted[0]?.passwordHash).toMatch(/^scrypt\$/);
    expect(inserted[0]?.passwordHash).not.toBe(password);
    await expect(verifyPassword(password, String(inserted[0]?.passwordHash))).resolves.toBe(true);
  });

  it("rejects a duplicate normalized local email without inserting", async () => {
    const { inserted } = setupTransaction([{ userId: 7, email: "duplicate@example.com" }]);
    await expect(enrollLocalCredentials({ userId: 42, firstName: "Existing", lastName: "User", email: " Duplicate@Example.com ", password: "StrongPassword2026" })).rejects.toThrow("already uses this email");
    expect(inserted).toHaveLength(0);
  });

  it("rejects invalid passwords before any credential write", async () => {
    const { inserted } = setupTransaction();
    await expect(enrollLocalCredentials({ userId: 42, firstName: "Existing", lastName: "User", email: "user@example.com", password: "too-short" })).rejects.toThrow("at least 12 characters");
    expect(inserted).toHaveLength(0);
    expect(isValidLocalPassword("StrongPassword2026")).toBe(true);
    expect(isValidLocalPassword("weakpassword")).toBe(false);
  });

  it("rejects unauthenticated enrollment", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as never, res: {} as never });
    await expect(caller.auth.enroll({ firstName: "No", lastName: "User", email: "none@example.com", password: "StrongPassword2026" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("keeps normalization and scrypt verification stable", async () => {
    expect(normalizeEmail(" Person@Example.COM ")).toBe("person@example.com");
    const hash = await hashPassword("StrongPassword2026");
    expect(hash).not.toContain("StrongPassword2026");
    await expect(verifyPassword("StrongPassword2026", hash)).resolves.toBe(true);
    await expect(verifyPassword("WrongPassword2026", hash)).resolves.toBe(false);
  });

  it("logs in with the newly enrolled credential through the existing route", async () => {
    const passwordHash = await hashPassword("StrongPassword2026");
    getDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: async () => [{
                user: { id: 42, openId: "local_existing_user", name: "Existing User" },
                passwordHash,
              }],
            }),
          }),
        }),
      }),
    });
    const cookies: unknown[] = [];
    const caller = appRouter.createCaller({
      user: null,
      req: { ip: "127.0.0.1", protocol: "https", headers: {} } as never,
      res: { cookie: (...args: unknown[]) => cookies.push(args) } as never,
    });
    await expect(caller.auth.localLogin({ email: " Existing@Example.com ", password: "StrongPassword2026" })).resolves.toEqual({ success: true });
    expect(cookies).toHaveLength(1);
  });
});
