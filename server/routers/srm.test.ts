import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb }));

import { srmRouter } from "./srm";

const cashierContext = {
  req: {} as any,
  res: {} as any,
  user: {
    id: 44,
    openId: "cashier-user",
    name: "Cashier",
    email: "cashier@example.com",
    loginMethod: "oauth",
    role: "cashier" as const,
    storeId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
};

const superAdminContext = {
  ...cashierContext,
  user: { ...cashierContext.user, id: 1, openId: "owner", role: "super_admin" as const, storeId: null },
};

describe("backend-only SRM and Accounts Payable boundary", () => {
  it("rejects Cashier access to supplier recognition, payments, and global debt before querying the database", async () => {
    getDb.mockReset();
    const caller = srmRouter.createCaller(cashierContext);
    await expect(caller.suppliers.recognizeOrCreate({ storeId: 1, name: "Northstar Wholesale" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.payments.register({ storeId: 1, supplierId: 1, amount: 25 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.accountsPayable.globalTotal({ storeId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("returns the current supplier debt sum only through the permitted global Accounts Payable procedure", async () => {
    getDb.mockReset();
    getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => Promise.resolve([{ totalDebt: "120.45" }]) })),
    });
    const caller = srmRouter.createCaller(superAdminContext);
    await expect(caller.accountsPayable.globalTotal({})).resolves.toEqual({ totalDebt: 120.45, scope: "enterprise" });
  });

  it("uses transactional invoice debt fields, payment allocations, and supplier current debt as the sole Accounts Payable synchronization path", () => {
    const source = readFileSync(new URL("./srm.ts", import.meta.url), "utf8");
    const commitSource = readFileSync(new URL("./inventory.ts", import.meta.url), "utf8");
    expect(source).toContain('const financialRoles: BranchStaffRole[] = ["admin", "supervisor"]');
    expect(source).toContain("supplierPaymentAllocations");
    const supplierLock = source.indexOf('from(suppliers).where(eq(suppliers.id, input.supplierId)).for("update")');
    const invoiceLock = source.indexOf('.orderBy(asc(invoices.id)).for("update")');
    expect(supplierLock).toBeGreaterThan(-1);
    expect(invoiceLock).toBeGreaterThan(supplierLock);
    expect(source).toContain("const outstandingRows = [...lockedOutstandingRows].sort");
    expect(source).toContain("amountPaid: money(Number(invoice.amountPaid) + allocation).toFixed(2)");
    expect(source).toContain("currentDebt: remainingSupplierDebt.toFixed(2)");
    expect(source).toContain("globalTotal: accountsPayableProcedure");
    expect(commitSource).toContain("totalAmount");
    expect(commitSource).toContain("remainingDebt");
    expect(commitSource).toContain("supplierInvoiceLines");
    expect(commitSource).toContain("Amount paid cannot exceed the supplier invoice total");
  });
});
