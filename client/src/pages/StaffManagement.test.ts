import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Staff access management", () => {
  it("separates global Super Admins from per-branch role assignments", () => {
    const source = readFileSync(new URL("./StaffManagement.tsx", import.meta.url), "utf8");
    expect(source).toContain('"admin" | "cashier" | "stock_manager" | "supervisor"');
    expect(source).toContain("trpc.users.directory.list.useQuery({ page, pageSize: 10 }");
    expect(source).toContain("trpc.users.directory.update.useMutation");
    expect(source).toContain("trpc.users.directory.create.useMutation");
    expect(source).toContain("trpc.users.directory.remove.useMutation");
    expect(source).toContain("trpc.users.directory.changePassword.useMutation");
    expect(source).toContain("All registered accounts");
    expect(source).toContain("No registered email");
    expect(source).toContain("Permanently delete");
    expect(source).toContain("Change password");
    expect(source).toContain("Edit Role & Permissions");
    expect(source).toContain("pageCount");
    expect(source).toContain("Only Super Admins can access the global user-management hub.");
    expect(source).toContain("Super Admin — all branches");
    expect(source).toContain("trpc.users.superAdmins.list.useQuery");
    expect(source).toContain("trpc.users.branchStaff.list.useQuery({ storeId }");
    expect(source).toContain("trpc.users.branchStaff.createLocal.useMutation");
    expect(source).toContain("trpc.users.branchStaff.update.useMutation");
    expect(source).toContain("trpc.users.superAdmins.update.useMutation");
    expect(source).toContain("trpc.users.branchStaff.remove.useMutation");
    expect(source).toContain("Global Roles / Super Admins");
    expect(source).toContain("applies <strong>only</strong>");
    expect(source).toContain("Edit global access");
    expect(source).toContain("Edit branch role");
    expect(source).toContain("Save branch role");
    expect(source).toContain("utils.auth.me.invalidate()");
    expect(source).toContain("createLocal.useMutation");
    expect(source).toContain("First name");
    expect(source).toContain("Last name");
    expect(source).toContain("Temporary password");
    expect(source).toContain("Add Employee");
  });
});
