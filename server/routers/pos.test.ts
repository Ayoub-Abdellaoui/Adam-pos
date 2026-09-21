import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb }));

import { posRouter } from "./pos";

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

const supervisorContext = { ...cashierContext, user: { ...cashierContext.user, id: 45, openId: "supervisor-user", name: "Supervisor", role: "supervisor" as const } };
const stockManagerContext = { ...cashierContext, user: { ...cashierContext.user, id: 46, openId: "stock-user", name: "Stock Manager", role: "stock_manager" as const } };

const listResult = (value: unknown) => ({ from: () => ({ where: () => Promise.resolve(value) }) });
const oneResult = (value: unknown) => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(value), for: () => ({ limit: () => Promise.resolve(value) }) }) }) });

describe("POS server safety", () => {
  it("exposes only sellable branch products for cashier quick-key setup", () => {
    const source = readFileSync(new URL("./pos.ts", import.meta.url), "utf8");
    expect(source).toContain("quickKeyProducts: posProcedure");
    expect(source).toContain("where(eq(products.storeId, storeId))");
    expect(source).toContain("slice(0, 26)");
    expect(source).not.toContain("lastCostPrice: products.lastCostPrice");
  });
  it("supports credit checkout contracts and transactional customer debt snapshots", () => {
    const source = readFileSync(new URL("./pos.ts", import.meta.url), "utf8");
    expect(source).toContain('"credit"');
    expect(source).toContain("creditCustomer");
    expect(source).toContain("amountPaidNow");
    expect(source).toContain("remainingDebt");
    expect(source).toContain("customers.totalDebt");
  });

  it("reconciles credit invoice returns against stock and the customer debt ledger", () => {
    const source = readFileSync(new URL("./pos.ts", import.meta.url), "utf8");
    expect(source).toContain("customerDebtTransactions");
    expect(source).toContain('transactionType: "return_credit"');
    expect(source).toContain("debtReduction");
  });

  it("locks a receipt parent before reading return quantities and locks the customer debt snapshot", () => {
    const source = readFileSync(new URL("./pos.ts", import.meta.url), "utf8");
    const saleLock = source.indexOf('eq(sales.id, input.saleId)).for("update")');
    const returnRead = source.indexOf("const priorReturns = await tx.select", saleLock);
    expect(saleLock).toBeGreaterThan(-1);
    expect(returnRead).toBeGreaterThan(saleLock);
    expect(source).toContain("where(eq(customers.id, sale.customerId)).for(\"update\")");
    expect(source).toContain("const storeId = input.previewStoreId ? resolvePosStore(ctx.user, input.previewStoreId) : sale.storeId;");
  });

  it("requires an explicit branch before a Super Admin preview accesses the database", async () => {
    getDb.mockReset();
    const caller = posRouter.createCaller({ ...cashierContext, user: { ...cashierContext.user, role: "super_admin", isSuperAdmin: true, storeId: null } });
    await expect(caller.lookupBarcode({ barcode: "9780000000001" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("blocks Stock Managers from POS checkout before touching the database", async () => {
    getDb.mockReset();
    const caller = posRouter.createCaller(stockManagerContext);
    await expect(caller.checkout({ paymentMethod: "cash", items: [{ customName: "Service", customAmount: 10 }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("allows branch Cashiers through the receipt-return authorization boundary", async () => {
    getDb.mockReset();
    const caller = posRouter.createCaller(cashierContext);
    await expect(caller.processReturn({ saleId: 71, items: [{ saleLineId: 301, quantity: 1 }] })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(getDb).toHaveBeenCalled();
    const source = readFileSync(new URL("./pos.ts", import.meta.url), "utf8");
    expect(source).toContain('findReceipt: roleProcedure("admin", "cashier", "supervisor")');
    expect(source).toContain('processReturn: roleProcedure("admin", "cashier", "supervisor")');
  });

  it("resolves an alternate barcode assigned to the same branch product", async () => {
    const alternateBarcodeMatch = { id: 9, name: "Soft Cover Journal", quantityOnHand: 4, retailPrice: "7.50", barcode: "978000000002" };
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({ limit: () => Promise.resolve([alternateBarcodeMatch]) }),
          }),
        }),
      })),
    };
    getDb.mockResolvedValue(db);

    const caller = posRouter.createCaller(cashierContext);
    await expect(caller.lookupBarcode({ barcode: "978000000002" })).resolves.toEqual(alternateBarcodeMatch);
  });

  it("resolves a product Reference inside the active branch with the same cart-ready data", async () => {
    const referenceMatch = { id: 9, name: "Soft Cover Journal", quantityOnHand: 4, retailPrice: "7.50", barcode: null };
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({ limit: () => Promise.resolve([referenceMatch]) }),
          }),
        }),
      })),
    };
    getDb.mockResolvedValue(db);

    const caller = posRouter.createCaller(cashierContext);
    await expect(caller.lookupReference({ reference: "REF20A" })).resolves.toEqual({ ...referenceMatch, barcode: "" });
  });

  it("creates a receipt and decrements in-branch stock within one transaction", async () => {
    const product = { id: 9, storeId: 1, name: "Soft Cover Journal", quantityOnHand: 4, retailPrice: "7.50", lastCostPrice: "4.00" };
    const tx = {
      select: vi.fn().mockReturnValueOnce(listResult([product])),
      insert: vi.fn()
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue([{ insertId: 71 }]) })
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue([{ insertId: 500 }]) }),
      update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) }) })),
    };
    const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    getDb.mockResolvedValue(db);

    const caller = posRouter.createCaller(supervisorContext);
    await expect(caller.checkout({ paymentMethod: "card", items: [{ productId: 9, quantity: 2, unitDiscount: 0.5 }] })).resolves.toMatchObject({ saleId: 71, invoiceNumber: "000000000071", total: "14.00", paymentMethod: "card", lines: [{ productName: "Soft Cover Journal", quantity: 2, unitPrice: "7.50", unitDiscount: "0.50", lineTotal: "14.00" }] });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(tx.insert).toHaveBeenCalledTimes(2);
  });

  it("records a custom-priced sale line without product lookup or stock deduction", async () => {
    const saleInsert = { values: vi.fn().mockResolvedValue([{ insertId: 72 }]) };
    const customLineInsert = { values: vi.fn().mockResolvedValue([{ insertId: 501 }]) };
    const tx = {
      select: vi.fn(),
      insert: vi.fn().mockReturnValueOnce(saleInsert).mockReturnValueOnce(customLineInsert),
      update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) }) })),
    };
    const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    getDb.mockResolvedValue(db);

    const caller = posRouter.createCaller(supervisorContext);
    await expect(caller.checkout({ paymentMethod: "cash", items: [{ customName: "Miscellaneous / عنصر متنوع", customAmount: 275.5, quantity: 1, unitDiscount: 0 }] })).resolves.toMatchObject({ saleId: 72, invoiceNumber: "000000000072", total: "275.50", lines: [{ productName: "Miscellaneous / عنصر متنوع", quantity: 1, unitPrice: "275.50", lineTotal: "275.50" }] });
    expect(tx.select).not.toHaveBeenCalled();
    expect(customLineInsert.values).toHaveBeenCalledWith(expect.objectContaining({ saleId: 72, productId: null, productName: "Miscellaneous / عنصر متنوع", quantity: 1, unitPrice: "275.50", unitCost: "0.00", lineTotal: "275.50" }));
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it("auto-opens one cashier shift and links the sale when no shift is already open", async () => {
    const shiftInsert = { values: vi.fn().mockResolvedValue([{ insertId: 201 }]) };
    const saleInsert = { values: vi.fn().mockResolvedValue([{ insertId: 73 }]) };
    const customLineInsert = { values: vi.fn().mockResolvedValue([{ insertId: 502 }]) };
    const tx = {
      select: vi.fn().mockReturnValueOnce(oneResult([])),
      insert: vi.fn().mockReturnValueOnce(shiftInsert).mockReturnValueOnce(saleInsert).mockReturnValueOnce(customLineInsert),
      update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) }) })),
    };
    const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    getDb.mockResolvedValue(db);

    const caller = posRouter.createCaller(cashierContext);
    await expect(caller.checkout({ paymentMethod: "cash", items: [{ customName: "Cashier service", customAmount: 25, quantity: 1, unitDiscount: 0 }] })).resolves.toMatchObject({ saleId: 73, total: "25.00" });
    expect(shiftInsert.values).toHaveBeenCalledWith(expect.objectContaining({ storeId: 1, cashierUserId: 44, openedByUserId: 44, openingCash: "0.00", expectedCash: "0.00" }));
    expect(saleInsert.values).toHaveBeenCalledWith(expect.objectContaining({ cashierUserId: 44, shiftId: 201 }));
  });

  it("records a direct product return and restores the exact branch product quantity atomically", async () => {
    const product = { id: 9, storeId: 1, name: "Soft Cover Journal", quantityOnHand: 0, retailPrice: "7.50" };
    const directReturnInsert = { values: vi.fn().mockResolvedValue([{ insertId: 91 }]) };
    const directLineInsert = { values: vi.fn().mockResolvedValue([{ insertId: 92 }]) };
    const tx = {
      select: vi.fn().mockReturnValueOnce(listResult([product])),
      insert: vi.fn().mockReturnValueOnce(directReturnInsert).mockReturnValueOnce(directLineInsert),
      update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) }) })),
    };
    const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    getDb.mockResolvedValue(db);

    const caller = posRouter.createCaller(cashierContext);
    await expect(caller.processDirectReturn({ reason: "Unopened item", items: [{ productId: 9, quantity: 2 }] })).resolves.toMatchObject({ directReturnId: 91, totalRefund: "15.00", returnedLines: 1 });
    expect(directReturnInsert.values).toHaveBeenCalledWith(expect.objectContaining({ storeId: 1, cashierUserId: 44, totalRefund: "15.00" }));
    expect(directLineInsert.values).toHaveBeenCalledWith({ directReturnId: 91, productId: 9, productName: "Soft Cover Journal", quantity: 2, unitRefund: "7.50", lineTotal: "15.00" });
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it("rejects a return quantity beyond the remaining quantity before it restores inventory", async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(oneResult([{ id: 71, storeId: 1 }]))
        .mockReturnValueOnce(listResult([{ id: 301, saleId: 71, productId: 9, productName: "Soft Cover Journal", quantity: 3, unitPrice: "7.50", unitDiscount: "0.00" }]))
        .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => Promise.resolve([{ saleLineId: 301, quantity: 2 }]) }) }) }),
      insert: vi.fn(),
      update: vi.fn(),
    };
    const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    getDb.mockResolvedValue(db);

    const caller = posRouter.createCaller(supervisorContext);
    await expect(caller.processReturn({ saleId: 71, items: [{ saleLineId: 301, quantity: 2 }] })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("derives the original sale branch for an authorized supervisor invoice return", async () => {
    const returnInsert = { values: vi.fn().mockResolvedValue([{ insertId: 93 }]) };
    const lineInsert = { values: vi.fn().mockResolvedValue([{ insertId: 94 }]) };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(oneResult([{ id: 71, storeId: 1, paymentMethod: "cash", customerId: null }]))
        .mockReturnValueOnce(listResult([{ id: 301, saleId: 71, productId: 9, productName: "Soft Cover Journal", quantity: 2, unitPrice: "7.50", unitDiscount: "0.00" }]))
        .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => Promise.resolve([]) }) }) }),
      insert: vi.fn().mockReturnValueOnce(returnInsert).mockReturnValueOnce(lineInsert),
      update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) }) })),
    };
    const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    getDb.mockResolvedValue(db);
    const caller = posRouter.createCaller(supervisorContext);
    await expect(caller.processReturn({ saleId: 71, items: [{ saleLineId: 301, quantity: 1 }] })).resolves.toMatchObject({ returnId: 93, saleId: 71, totalRefund: "7.50" });
    expect(returnInsert.values).toHaveBeenCalledWith(expect.objectContaining({ saleId: 71, storeId: 1, cashierUserId: 45 }));
  });

  it("allows a Super Admin invoice return to use the original sale branch without preview selection", async () => {
    const returnInsert = { values: vi.fn().mockResolvedValue([{ insertId: 95 }]) };
    const lineInsert = { values: vi.fn().mockResolvedValue([{ insertId: 96 }]) };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(oneResult([{ id: 72, storeId: 2, paymentMethod: "cash", customerId: null }]))
        .mockReturnValueOnce(listResult([{ id: 302, saleId: 72, productId: 9, productName: "Soft Cover Journal", quantity: 1, unitPrice: "7.50", unitDiscount: "0.00" }]))
        .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => Promise.resolve([]) }) }) }),
      insert: vi.fn().mockReturnValueOnce(returnInsert).mockReturnValueOnce(lineInsert),
      update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) }) })),
    };
    const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    getDb.mockResolvedValue(db);
    const superAdminContext = { ...supervisorContext, user: { ...supervisorContext.user, id: 99, role: "super_admin" as const, isSuperAdmin: true, storeId: null } };
    const caller = posRouter.createCaller(superAdminContext);
    await expect(caller.processReturn({ saleId: 72, items: [{ saleLineId: 302, quantity: 1 }] })).resolves.toMatchObject({ returnId: 95, saleId: 72, totalRefund: "7.50" });
    expect(returnInsert.values).toHaveBeenCalledWith(expect.objectContaining({ saleId: 72, storeId: 2, cashierUserId: 99 }));
  });
});
