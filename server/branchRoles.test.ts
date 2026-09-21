import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { isSuperAdmin, requireBranchRole } from "./_core/trpc";

const branchUser = {
  id: 8,
  openId: "branch-user",
  name: "Branch User",
  email: null,
  loginMethod: "manus",
  role: "cashier",
  storeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  isSuperAdmin: false,
  branchRoles: [
    { storeId: 2, role: "cashier" as const },
    { storeId: 1, role: "admin" as const },
  ],
};

describe("branch-scoped role authorization", () => {
  it("permits different roles per branch but forbids cross-branch escalation", () => {
    expect(requireBranchRole(branchUser, 2, ["cashier"])).toBe("cashier");
    expect(requireBranchRole(branchUser, 1, ["admin"])).toBe("admin");
    expect(() => requireBranchRole(branchUser, 2, ["admin"])).toThrow(TRPCError);
    expect(() => requireBranchRole(branchUser, 3, ["cashier", "admin"])).toThrow(TRPCError);
  });

  it("retains unrestricted access exclusively for an explicit Super Admin", () => {
    const superAdmin = { ...branchUser, role: "super_admin" as const, isSuperAdmin: true, branchRoles: [] };
    expect(isSuperAdmin(superAdmin)).toBe(true);
    expect(requireBranchRole(superAdmin, 3, ["admin"])).toBe("super_admin");
  });
});
