import { describe, expect, it } from "vitest";

import { ENV } from "./_core/env";
import { getUserByOpenId } from "./db";
import { appRouter } from "./routers";

describe("TiDB interactive workflow readiness", () => {
  it("serves the read contracts behind the restored global and branch workspaces", async () => {
    const owner = await getUserByOpenId(ENV.ownerOpenId);
    expect(owner?.isSuperAdmin).toBe(true);

    const caller = appRouter.createCaller({
      user: owner!,
      req: {} as any,
      res: {} as any,
    });

    const branches = await caller.enterprise.branches.list();
    expect(branches.map(branch => branch.code)).toEqual(expect.arrayContaining(["COS", "BOOK", "CLOTH"]));
    const activeBranch = branches.find(branch => branch.isActive);
    expect(activeBranch).toBeDefined();
    const storeId = activeBranch!.id;

    const cosmetics = branches.find(branch => branch.type === "cosmetics");
    expect(cosmetics).toBeDefined();
    await expect(caller.enterprise.branches.create({
      name: cosmetics!.name,
      code: cosmetics!.code,
      type: "cosmetics",
    })).rejects.toMatchObject({ code: "CONFLICT", message: "A branch with this name or code already exists." });

    await expect(Promise.all([
      caller.enterprise.branches.active(),
      caller.enterprise.globalStatistics({ from: new Date("2000-01-01T00:00:00.000Z"), to: new Date() }),
      caller.enterprise.shifts.active({ storeId }),
      caller.enterprise.shifts.summary({ storeId }),
      caller.enterprise.transfers.catalog({ storeId }),
      caller.inventory.dashboard(),
      caller.inventory.productCatalog(),
      caller.pos.quickKeyMappings({ previewStoreId: storeId }),
      caller.pos.quickKeyProducts({ previewStoreId: storeId }),
      caller.finance.suppliers.list({ search: "" }),
      caller.finance.invoices.list({ search: "", onlyOutstanding: false }),
      caller.finance.expenses.list({ search: "", includeVoided: false }),
      caller.srm.accountsPayable.globalTotal({}),
      caller.srm.accountsPayable.supplierBalances({}),
      caller.cashOut.activeShifts({ storeId }),
      caller.cashOut.employeeSearch({ storeId, query: "", limit: 12 }),
      caller.cashOut.ledger({ limit: 100 }),
      caller.users.directory.list({ page: 1, pageSize: 20 }),
      caller.users.superAdmins.list(),
    ])).resolves.toHaveLength(19);
  }, 30_000);
});
