import { describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";

const { getDb, ensureRetailBranches } = vi.hoisted(() => ({
  getDb: vi.fn(),
  ensureRetailBranches: vi.fn(),
}));

vi.mock("../db", () => ({ getDb, ensureRetailBranches }));

import { inventoryRouter } from "./inventory";

const baseContext = {
  req: {} as any,
  res: {} as any,
  user: {
    id: 42,
    openId: "admin-user",
    name: "Admin",
    email: "admin@example.com",
    loginMethod: "oauth",
    role: "super_admin" as const,
    storeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
};

const limitResult = (value: unknown) => ({
  from: () => ({ where: () => ({ limit: () => Promise.resolve(value) }) }),
});

const reviewSession = {
  id: "00000000-0000-4000-8000-000000000001",
  sourceFileKey: "invoice-sources/42/document.pdf",
  extractionPayload: "{}",
  exceptionsPayload: "[]",
};

describe("inventory authorization and commit boundary", () => {
  it("denies the central dashboard to a cashier before touching the database", async () => {
    getDb.mockReset();
    ensureRetailBranches.mockReset();
    const caller = inventoryRouter.createCaller({ ...baseContext, user: { ...baseContext.user, role: "cashier", storeId: 1 } });

    await expect(caller.dashboard()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("exposes only quantity adjustment to sellers while preserving full catalog restrictions", () => {
    const source = readFileSync(new URL("./inventory.ts", import.meta.url), "utf8");
    expect(source).toContain('adjustQuantity: roleProcedure("admin", "cashier")');
    expect(source).toContain('requireBranchRole(ctx.user, product.storeId, ["admin", "cashier"])');
    expect(source).toContain('set({ quantityOnHand: input.stockQuantity })');
    expect(source).toContain('updateProduct: stockProcedure.input(updateProductInput)');
  });

  it("returns only product name and stock quantity to a Cashier in the assigned branch", async () => {
    getDb.mockReset();
    const db = { select: vi.fn(() => ({ from: () => ({ leftJoin: () => ({ where: () => ({ orderBy: () => Promise.resolve([{ id: 7, name: "Book Product", stockQuantity: 14 }]) }) }) }) })) };
    getDb.mockResolvedValue(db);
    const cashier = inventoryRouter.createCaller({ ...baseContext, user: { ...baseContext.user, role: "cashier", storeId: 2 } });
    await expect(cashier.availableProducts({ storeId: 2 })).resolves.toEqual([{ id: 7, name: "Book Product", stockQuantity: 14 }]);
    const source = readFileSync(new URL("./inventory.ts", import.meta.url), "utf8");
    expect(source).toContain('availableProducts: roleProcedure("cashier")');
    expect(source).toContain('stockQuantity: products.quantityOnHand');
    expect(source).toContain('requireBranchRole(ctx.user, input.storeId, ["cashier"])');
    expect(source).toContain('like(products.name');
    expect(source).toContain('like(products.reference');
    expect(source).toContain('like(barcodes.value');
  });

  it("lets a Cashier cross the quantity-only mutation boundary but not full product editing", async () => {
    getDb.mockReset();
    const cashier = inventoryRouter.createCaller({ ...baseContext, user: { ...baseContext.user, role: "cashier", storeId: 1 } });
    await expect(cashier.adjustQuantity({ productId: 9, stockQuantity: 12 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(getDb).toHaveBeenCalled();
    getDb.mockReset();
    await expect(cashier.updateProduct({ productId: 9, name: "Restricted", sellingPrice: 10, purchasePrice: 5, stockQuantity: 12, barcodes: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("blocks Cashiers from inventory mutation and Stock Managers from financial analytics", async () => {
    getDb.mockReset();
    const cashier = inventoryRouter.createCaller({ ...baseContext, user: { ...baseContext.user, role: "cashier", storeId: 1 } });
    await expect(cashier.createProduct({ storeId: 1, name: "Restricted", purchasePrice: 1, sellingPrice: 2, stockQuantity: 1, barcodes: ["1111111111111"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
    const stockManager = inventoryRouter.createCaller({ ...baseContext, user: { ...baseContext.user, role: "stock_manager", storeId: 1 } });
    await expect(stockManager.analytics({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("keeps SKU search inventory-authorized and redacts product costs at the product-detail response boundary", async () => {
    getDb.mockReset();
    const cashier = inventoryRouter.createCaller({ ...baseContext, user: { ...baseContext.user, role: "cashier", storeId: 1 } });
    await expect(cashier.productSearch({ storeId: 1, query: "SKU-100" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
    const source = readFileSync(new URL("./inventory.ts", import.meta.url), "utf8");
    expect(source).toContain("productSearch: stockProcedure.input(productSearchInput)");
    expect(source).toContain("like(products.sku");
    expect(source).toContain("like(products.reference");
    expect(source).toContain("reference: input.reference || input.sku || null");
    expect(source).toContain("sellingPrice: z.number().finite().nonnegative()");
    expect(source).toContain("profitMarginEnabled: z.boolean().default(false)");
    expect(source).toContain("profitMarginEnabled: line.profitMarginEnabled");
    expect(source).toContain("retailPrice: asMoney(line.sellingPrice)");
    expect(source).toContain("productDetail: protectedProcedure.input(productDetailInput)");
    expect(source).toContain("if (!canViewFinancials) return { ...base, sellingPrice: product.sellingPrice }");
  });

  it("validates archive date ranges before attempting a sales archive query", async () => {
    getDb.mockReset();
    const caller = inventoryRouter.createCaller(baseContext);
    await expect(caller.salesArchive({ from: new Date("2026-08-15T00:00:00.000Z"), to: new Date("2026-08-14T23:59:59.999Z") })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("uses one database transaction for supplier, invoice, inventory, and stock-entry writes", async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(limitResult([reviewSession]))
        .mockReturnValueOnce(limitResult([{ id: 1, name: "Cosmetics", code: "COS" }]))
        .mockReturnValueOnce(limitResult([]))
        .mockReturnValueOnce(limitResult([{ id: 9, name: "Northstar Wholesale" }]))
        .mockReturnValueOnce(limitResult([]))
        .mockReturnValueOnce(limitResult([{ id: 17, storeId: 1, name: "Velvet Lip Tint" }])),
      insert: vi.fn()
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue([{ insertId: 9 }]) })
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue([{ insertId: 88 }]) })
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue([{ insertId: 17 }]) })
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue([{ insertId: 501 }]) })
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue([{ insertId: 701 }]) }),
      update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve() }) })),
      delete: vi.fn(() => ({ where: () => Promise.resolve() })),
    };
    const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    getDb.mockResolvedValue(db);
    ensureRetailBranches.mockResolvedValue(undefined);

    const caller = inventoryRouter.createCaller(baseContext);
    await expect(caller.commitInvoice({
      storeId: 1,
      supplierName: "Northstar Wholesale",
      sourceFileKey: "invoice-sources/42/document.pdf",
      reviewSessionId: reviewSession.id,
      originalFileName: "document.pdf",
      sourceMimeType: "application/pdf",
      items: [{ productName: "Velvet Lip Tint", quantity: 12, costPrice: 4.5 }],
    })).resolves.toMatchObject({ invoiceId: 88, committedLines: 1 });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(5);
  });

  it("commits every unique barcode attached to one staged invoice product row", async () => {
    const invoiceInsert = { values: vi.fn().mockResolvedValue([{ insertId: 88 }]) };
    const barcodeOneInsert = { values: vi.fn().mockResolvedValue([{ insertId: 501 }]) };
    const barcodeTwoInsert = { values: vi.fn().mockResolvedValue([{ insertId: 502 }]) };
    const stockInsert = { values: vi.fn().mockResolvedValue([{ insertId: 700 }]) };
    const tx = {
      delete: vi.fn(() => ({ where: () => Promise.resolve() })),
      select: vi.fn()
        .mockReturnValueOnce(limitResult([reviewSession]))
        .mockReturnValueOnce(limitResult([{ id: 1, name: "Cosmetics", code: "COS" }]))
        .mockReturnValueOnce(limitResult([{ id: 9, name: "Northstar Wholesale" }]))
        .mockReturnValueOnce(limitResult([{ id: 17, storeId: 1, name: "Velvet Lip Tint" }]))
        .mockReturnValueOnce(limitResult([]))
        .mockReturnValueOnce(limitResult([])),
      insert: vi.fn().mockReturnValueOnce(invoiceInsert).mockReturnValueOnce(barcodeOneInsert).mockReturnValueOnce(barcodeTwoInsert).mockReturnValueOnce(stockInsert).mockReturnValueOnce({ values: vi.fn().mockResolvedValue([{ insertId: 701 }]) }),
      update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve() }) })),
    };
    const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    getDb.mockResolvedValue(db);
    ensureRetailBranches.mockResolvedValue(undefined);

    const caller = inventoryRouter.createCaller(baseContext);
    await expect(caller.commitInvoice({
      storeId: 1,
      supplierName: "Northstar Wholesale",
      sourceFileKey: "invoice-sources/42/document.pdf",
      reviewSessionId: reviewSession.id,
      originalFileName: "document.pdf",
      sourceMimeType: "application/pdf",
      items: [{ productName: "Velvet Lip Tint", quantity: 12, costPrice: 4.5, barcodes: ["1111111111111", "2222222222222"] }],
    })).resolves.toMatchObject({ invoiceId: 88, committedLines: 1 });

    expect(barcodeOneInsert.values).toHaveBeenCalledWith({ productId: 17, value: "1111111111111" });
    expect(barcodeTwoInsert.values).toHaveBeenCalledWith({ productId: 17, value: "2222222222222" });
  });

  it("rejects an existing barcode owned by another product within the transaction", async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(limitResult([reviewSession]))
        .mockReturnValueOnce(limitResult([{ id: 1, name: "Cosmetics", code: "COS" }]))
        .mockReturnValueOnce(limitResult([{ id: 9, name: "Northstar Wholesale" }]))
        .mockReturnValueOnce(limitResult([{ id: 17, storeId: 1, name: "Velvet Lip Tint" }]))
        .mockReturnValueOnce(limitResult([{ id: 77, productId: 999, value: "1234567890123" }])),
      insert: vi.fn().mockReturnValueOnce({ values: vi.fn().mockResolvedValue([{ insertId: 89 }]) }),
      update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve() }) })),
    };
    const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    getDb.mockResolvedValue(db);
    ensureRetailBranches.mockResolvedValue(undefined);

    const caller = inventoryRouter.createCaller(baseContext);
    await expect(caller.commitInvoice({
      storeId: 1,
      supplierName: "Northstar Wholesale",
      sourceFileKey: "invoice-sources/42/document.pdf",
      reviewSessionId: reviewSession.id,
      originalFileName: "document.pdf",
      sourceMimeType: "application/pdf",
      items: [{ productName: "Velvet Lip Tint", quantity: 12, costPrice: 4.5, barcode: "1234567890123" }],
    })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });

  it("groups real inventory barcodes for the Admin label catalog", async () => {
    const db = {
      select: vi.fn(() => ({
        from: () => ({ innerJoin: () => ({ leftJoin: () => ({ orderBy: () => Promise.resolve([
          { id: 12, name: "Everyday Notebook", retailPrice: "8.50", storeId: 1, storeName: "Bookstore", barcode: "978000000001" },
          { id: 12, name: "Everyday Notebook", retailPrice: "8.50", storeId: 1, storeName: "Bookstore", barcode: "978000000002" },
        ]) }) }) }),
      })),
    };
    getDb.mockResolvedValue(db);
    ensureRetailBranches.mockResolvedValue(undefined);

    const caller = inventoryRouter.createCaller(baseContext);
    await expect(caller.labelProducts()).resolves.toEqual([{
      id: 12,
      name: "Everyday Notebook",
      retailPrice: "8.50",
      storeId: 1,
      storeName: "Bookstore",
      barcodes: ["978000000001", "978000000002"],
    }]);
  });

  it("returns product management records with all branch barcodes grouped into an array", async () => {
    const db = {
      select: vi.fn()
        .mockReturnValueOnce({ from: () => ({ orderBy: () => Promise.resolve([{ id: 1, name: "Bookstore" }]) }) })
        .mockReturnValueOnce({
          from: () => ({
            innerJoin: () => ({
              leftJoin: () => ({
                orderBy: () => Promise.resolve([
                  { id: 12, name: "Everyday Notebook", storeId: 1, storeName: "Bookstore", purchasePrice: "3.25", sellingPrice: "8.50", stockQuantity: 14, barcode: "978000000001" },
                  { id: 12, name: "Everyday Notebook", storeId: 1, storeName: "Bookstore", purchasePrice: "3.25", sellingPrice: "8.50", stockQuantity: 14, barcode: "978000000002" },
                ]),
              }),
            }),
          }),
        }),
    };
    getDb.mockResolvedValue(db);
    ensureRetailBranches.mockResolvedValue(undefined);

    const caller = inventoryRouter.createCaller(baseContext);
    await expect(caller.productCatalog()).resolves.toEqual({
      stores: [{ id: 1, name: "Bookstore" }],
      products: [{ id: 12, name: "Everyday Notebook", storeId: 1, storeName: "Bookstore", purchasePrice: "3.25", sellingPrice: "8.50", stockQuantity: 14, barcodes: ["978000000001", "978000000002"] }],
    });
  });

  it("resolves any assigned inventory barcode within the selected branch", async () => {
    const alternateBarcodeMatch = { id: 12, name: "Everyday Notebook", purchasePrice: "3.25", sellingPrice: "8.50", stockQuantity: 14, barcode: "978000000002" };
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

    const caller = inventoryRouter.createCaller(baseContext);
    await expect(caller.lookupProductByBarcode({ storeId: 1, barcode: "978000000002" })).resolves.toEqual(alternateBarcodeMatch);
  });

  it("creates a product with multiple barcodes, purchase price, selling price, and stock quantity", async () => {
    const productInsert = { values: vi.fn().mockResolvedValue([{ insertId: 41 }]) };
    const barcodeInsert = { values: vi.fn().mockResolvedValue([{ insertId: 1 }]) };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(limitResult([{ id: 1 }]))
        .mockReturnValueOnce(limitResult([]))
        .mockReturnValueOnce(limitResult([]))
        .mockReturnValueOnce(limitResult([])),
      insert: vi.fn().mockReturnValueOnce(productInsert).mockReturnValueOnce(barcodeInsert),
    };
    const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    getDb.mockResolvedValue(db);
    ensureRetailBranches.mockResolvedValue(undefined);

    const caller = inventoryRouter.createCaller(baseContext);
    await expect(caller.createProduct({ storeId: 1, name: "Everyday Notebook", purchasePrice: 3.25, sellingPrice: 8.5, stockQuantity: 14, barcodes: ["978000000001", "978000000002"] })).resolves.toEqual({ productId: 41 });
    expect(productInsert.values).toHaveBeenCalledWith(expect.objectContaining({ quantityOnHand: 14, lastCostPrice: "3.25", retailPrice: "8.50" }));
    expect(barcodeInsert.values).toHaveBeenCalledWith([{ productId: 41, value: "978000000001" }, { productId: 41, value: "978000000002" }]);
  });

  it("updates product prices and stock while synchronizing added and removed barcodes", async () => {
    const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const remove = vi.fn().mockResolvedValue(undefined);
    const barcodeInsert = { values: vi.fn().mockResolvedValue([{ insertId: 8 }]) };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(limitResult([{ id: 12, storeId: 1 }]))
        .mockReturnValueOnce(limitResult([{ id: 12 }]))
        .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([{ id: 1, value: "978000000001" }, { id: 2, value: "978000000002" }]) }) })
        .mockReturnValueOnce(limitResult([])),
      update: vi.fn(() => ({ set })),
      delete: vi.fn(() => ({ where: remove })),
      insert: vi.fn(() => barcodeInsert),
    };
    const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    getDb.mockResolvedValue(db);

    const caller = inventoryRouter.createCaller(baseContext);
    await expect(caller.updateProduct({ productId: 12, name: "Everyday Notebook", purchasePrice: 3.75, sellingPrice: 9.5, stockQuantity: 10, barcodes: ["978000000002", "978000000003"] })).resolves.toEqual({ productId: 12 });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ quantityOnHand: 10, lastCostPrice: "3.75", retailPrice: "9.50" }));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(barcodeInsert.values).toHaveBeenCalledWith([{ productId: 12, value: "978000000003" }]);
  });

  it("rejects a duplicate barcode inside one product request before touching the database", async () => {
    getDb.mockReset();
    const caller = inventoryRouter.createCaller(baseContext);

    await expect(caller.createProduct({ storeId: 1, name: "Everyday Notebook", purchasePrice: 3.25, sellingPrice: 8.5, stockQuantity: 14, barcodes: ["978000000001", "978000000001"] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("persists an Admin-assigned barcode only when it is unowned", async () => {
    const db = {
      select: vi.fn()
        .mockReturnValueOnce(limitResult([{ id: 12 }]))
        .mockReturnValueOnce(limitResult([])),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([{ insertId: 8 }]) })),
    };
    getDb.mockResolvedValue(db);

    const caller = inventoryRouter.createCaller(baseContext);
    await expect(caller.assignLabelBarcode({ productId: 12, barcode: "978000000001" })).resolves.toEqual({ barcode: "978000000001" });
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("returns archived finalized sales with persistent invoice data and item quantities", async () => {
    const rows = [{ id: 21, invoiceNumber: "000000000021", receiptNumber: "RCT-1-X", storeId: 1, storeName: "Bookstore", cashierName: "Admin", paymentMethod: "cash", subtotal: "120.00", discountTotal: "0.00", total: "120.00", createdAt: new Date("2026-08-15T10:00:00Z") }];
    const db = {
      select: vi.fn()
        .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ leftJoin: () => ({ where: () => ({ orderBy: () => ({ limit: () => Promise.resolve(rows) }) }) }) }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([{ saleId: 21, quantity: 2 }, { saleId: 21, quantity: 1 }]) }) }),
    };
    getDb.mockResolvedValue(db);
    const caller = inventoryRouter.createCaller(baseContext);
    await expect(caller.salesArchive({ search: "000000000021" })).resolves.toEqual([expect.objectContaining({ id: 21, invoiceNumber: "000000000021", itemCount: 3, total: "120.00" })]);
  });

  it("returns immutable line details for a selected archived sales invoice", async () => {
    const invoice = { id: 21, invoiceNumber: "000000000021", receiptNumber: "RCT-1-X", storeId: 1, storeName: "Bookstore", cashierName: "Admin", paymentMethod: "cash", subtotal: "120.00", discountTotal: "0.00", total: "120.00", createdAt: new Date("2026-08-15T10:00:00Z") };
    const lines = [{ id: 9, productId: 3, productName: "Notebook", quantity: 2, unitPrice: "60.00", unitCost: "25.00", unitDiscount: "0.00", lineTotal: "120.00" }];
    const db = {
      select: vi.fn()
        .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ leftJoin: () => ({ where: () => ({ limit: () => Promise.resolve([invoice]) }) }) }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => Promise.resolve(lines) }) }) }),
    };
    getDb.mockResolvedValue(db);
    const caller = inventoryRouter.createCaller(baseContext);
    await expect(caller.salesInvoiceDetail({ saleId: 21 })).resolves.toEqual({ invoice, lines });
  });
});
