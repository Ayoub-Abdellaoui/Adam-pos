import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("context-aware role update contracts", () => {
  it("keeps global access updates and branch assignment updates separate", () => {
    const source = readFileSync(new URL("./users.ts", import.meta.url), "utf8");
    expect(source).toContain("globalRole: z.enum([\"super_admin\", \"none\"])");
    expect(source).toContain("directory: router");
    expect(source).toContain("list: adminProcedure.input(globalDirectoryInput)");
    expect(source).toContain("update: adminProcedure.input(globalDirectoryUpdateInput)");
    expect(source).toContain("create: adminProcedure.input(localEmployeeInput)");
    expect(source).toContain("remove: adminProcedure.input(z.object({ userId: z.number().int().positive() }))");
    expect(source).toContain("changePassword: adminProcedure.input");
    expect(source).toContain("changeLocalEmployeePassword(input)");
    expect(source).toContain("from(users).orderBy(asc(users.name), asc(users.id))");
    expect(source).toContain("At least one Super Admin must remain active.");
    expect(source).toContain("await tx.delete(userBranchRoles).where(eq(userBranchRoles.userId, input.userId))");
    expect(source).toContain("superAdmins: router");
    expect(source).toContain("update: adminProcedure.input(globalAccessInput)");
    expect(source).toContain("branchStaff: router");
    expect(source).toContain("update: roleProcedure(\"admin\").input(branchInput.extend");
    expect(source).toContain("eq(userBranchRoles.storeId, input.storeId)");
    expect(source).toContain("Super Admin access can only be changed from global role management.");
    expect(source).toContain("createLocal: adminProcedure.input(localEmployeeInput)");
    expect(source).toContain("createLocal: roleProcedure(\"admin\").input(branchInput.extend");
    expect(source).toContain("createLocalEmployee({ ...input, globalRole: \"super_admin\" })");
    expect(source).toContain("branch: { storeId: input.storeId, role: input.role }");
    expect(source).toContain("assertNotPrimaryOwner");
    expect(source).toContain("The primary owner Super Admin role cannot be changed or removed.");
    expect(source).toContain("ENV.ownerOpenId");
    expect(source).toContain("historical records and cannot be deleted");
  });
});
