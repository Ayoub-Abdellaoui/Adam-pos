import { TRPCError } from "@trpc/server";
import { randomInt, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, like, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { barcodes, invoiceExceptionDecisions, invoiceReviewSessions, invoices, operationalExpenses, products, returnLines, saleLines, saleReturns, sales, stockEntries, stores, supplierInvoiceLines, supplierInvoicePayments, supplierPaymentAllocations, supplierPayments, suppliers, users } from "../../drizzle/schema";
import { calculateAnalytics } from "../analytics";
import { ensureRetailBranches, getDb } from "../db";
import { invoiceExtractionSchema, parseInvoiceWithVision, permittedInvoiceMimeTypes } from "../invoiceParser";
import { ReferenceSource } from "../ocrSpaceTest";
import { adminProcedure, assignedStoresForRoles, isSuperAdmin, protectedProcedure, requireBranchRole, roleProcedure, stockProcedure, router } from "../_core/trpc";

const barcodeArraySchema = z.array(z.string().trim().min(3).max(128)).max(50).superRefine((values, context) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const normalized = value.trim();
    if (seen.has(normalized)) context.addIssue({ code: "custom", path: [index], message: "Each barcode must be unique." });
    seen.add(normalized);
  });
});

const stagingLineSchema = z.object({
  productName: z.string().trim().min(1).max(255),
  reference: z.string().trim().max(128).regex(/^[A-Za-z0-9À-ÖØ-öø-ÿ]*$/, "References may contain only Latin letters and numbers.").default(""),
  sourceIndex: z.number().int().nonnegative().optional(),
  quantity: z.number().int().positive().max(1_000_000),
  costPrice: z.number().finite().nonnegative().max(9_999_999.99),
  profitMarginEnabled: z.boolean().default(false),
  profitMarginPercent: z.number().finite().nonnegative().max(100_000).default(0),
  sellingPrice: z.number().finite().nonnegative().max(9_999_999.99).default(0),
  barcodes: barcodeArraySchema.default([]),
  /** Retained temporarily for compatibility with older staged invoice clients. */
  barcode: z.string().trim().min(3).max(128).optional(),
});

const exceptionDecisionSchema = z.object({
  sourceIndex: z.number().int().nonnegative(),
  decision: z.enum(["include", "exclude", "edited"]),
});

const commitInvoiceInput = z.object({
  storeId: z.number().int().positive(),
  /** Existing supplier resolution is optional because AI invoice intake can identify only a name. */
  supplierId: z.number().int().positive().optional(),
  supplierName: z.string().trim().min(1).max(255),
  sourceFileKey: z.string().trim().min(1).max(512),
  reviewSessionId: z.string().uuid(),
  originalFileName: z.string().trim().min(1).max(255),
  sourceMimeType: z.enum(permittedInvoiceMimeTypes),
  /** Supplier-stated total may differ from inventory cost because of invoice-level tax, freight, or discounts. */
  totalAmount: z.number().finite().nonnegative().max(9_999_999.99).optional(),
  /** AI-extracted or confirmed upfront payment captured as part of the same audited commit transaction. */
  amountPaid: z.number().finite().nonnegative().max(9_999_999.99).default(0),
  exceptionDecisions: z.array(exceptionDecisionSchema).max(100).default([]),
  items: z.array(stagingLineSchema).min(1).max(500),
});

const analyticsInput = z.object({
  storeId: z.number().int().positive().optional(),
  lowStockThreshold: z.number().int().min(0).max(10_000).default(5),
});
const optionalInventoryStoreScope = z.object({ storeId: z.number().int().positive() }).optional();

const productDetailsSchema = z.object({
  name: z.string().trim().min(1).max(255),
  sku: z.string().trim().max(128).optional(),
  reference: z.string().trim().max(128).regex(/^[A-Za-z0-9À-ÖØ-öø-ÿ]*$/, "References may contain only Latin letters and numbers.").optional(),
  category: z.string().trim().max(120).optional(),
  variations: z.string().trim().max(5000).optional(),
  purchasePrice: z.number().finite().nonnegative().max(9_999_999.99),
  sellingPrice: z.number().finite().nonnegative().max(9_999_999.99),
  stockQuantity: z.number().int().nonnegative().max(1_000_000),
  barcodes: barcodeArraySchema,
});

const createProductInput = productDetailsSchema.extend({ storeId: z.number().int().positive() });
const updateProductInput = productDetailsSchema.extend({ productId: z.number().int().positive() });
const inventoryBarcodeLookupInput = z.object({ storeId: z.number().int().positive(), barcode: z.string().trim().min(3).max(128) });
const productSearchInput = z.object({ storeId: z.number().int().positive(), query: z.string().trim().max(128).default(""), limit: z.number().int().min(1).max(100).default(50) });
const productDetailInput = z.object({ productId: z.number().int().positive() });
const quantityAdjustmentInput = z.object({ productId: z.number().int().positive(), stockQuantity: z.number().int().nonnegative().max(1_000_000) });
const availableProductsInput = z.object({ storeId: z.number().int().positive(), query: z.string().trim().max(128).default("") });
const salesArchiveInput = z.object({ storeId: z.number().int().positive().optional(), search: z.string().trim().max(128).default(""), from: z.coerce.date().optional(), to: z.coerce.date().optional(), limit: z.number().int().min(1).max(100).default(50) }).refine(input => !input.from || !input.to || input.from <= input.to, { message: "The start date must be before the end date.", path: ["to"] });
const salesInvoiceDetailInput = z.object({ saleId: z.number().int().positive() });

function requireDatabase<T>(db: T): asserts db is Exclude<T, null> {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database service is unavailable." });
}

function asMoney(value: number): string {
  return value.toFixed(2);
}

function asMarginPercent(costPrice: number, sellingPrice: number): string {
  if (costPrice <= 0) return "0.00";
  return (((sellingPrice - costPrice) / costPrice) * 100).toFixed(2);
}

function resolveInventoryStore(user: Parameters<typeof requireBranchRole>[0], requestedStoreId?: number) {
  if (isSuperAdmin(user)) return requestedStoreId;
  const allowedStores = assignedStoresForRoles(user, ["admin", "stock_manager"]);
  const storeId = requestedStoreId ?? (allowedStores.length === 1 ? allowedStores[0] : undefined);
  if (!storeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an inventory branch before continuing." });
  requireBranchRole(user, storeId, ["admin", "stock_manager"]);
  return storeId;
}

/** Admin-only inventory workspace. All data mutating paths are server-side guarded. */
export const inventoryRouter = router({
  dashboard: stockProcedure.query(async ({ ctx }) => {
    await ensureRetailBranches();
    const db = await getDb();
    requireDatabase(db);
    const scopedStoreId = resolveInventoryStore(ctx.user);

    const [storeRows, productRows, recentRows] = await Promise.all([
      db.select().from(stores).where(scopedStoreId ? eq(stores.id, scopedStoreId) : undefined).orderBy(stores.name),
      db.select({ storeId: products.storeId, quantityOnHand: products.quantityOnHand }).from(products).where(scopedStoreId ? eq(products.storeId, scopedStoreId) : undefined),
      db
        .select({
          id: stockEntries.id,
          quantity: stockEntries.quantity,
          unitCost: stockEntries.unitCost,
          createdAt: stockEntries.createdAt,
          productName: products.name,
          storeName: stores.name,
          supplierName: suppliers.name,
        })
        .from(stockEntries)
        .innerJoin(products, eq(stockEntries.productId, products.id))
        .innerJoin(stores, eq(stockEntries.storeId, stores.id))
        .innerJoin(invoices, eq(stockEntries.invoiceId, invoices.id))
        .innerJoin(suppliers, eq(invoices.supplierId, suppliers.id))
        .where(scopedStoreId ? eq(stockEntries.storeId, scopedStoreId) : undefined)
        .orderBy(desc(stockEntries.createdAt))
        .limit(8),
    ]);

    const branches = storeRows.map(store => {
      const branchProducts = productRows.filter(product => product.storeId === store.id);
      return {
        ...store,
        productCount: branchProducts.length,
        unitsOnHand: branchProducts.reduce((total, product) => total + product.quantityOnHand, 0),
      };
    });

    return {
      branches,
      totalUnitsOnHand: branches.reduce((total, branch) => total + branch.unitsOnHand, 0),
      totalProducts: productRows.length,
      recentStock: recentRows,
    };
  }),

  /** Admin label-printing catalog. Products without a barcode are retained for assignment follow-up. */
  labelProducts: stockProcedure.input(optionalInventoryStoreScope).query(async ({ ctx, input }) => {
    await ensureRetailBranches();
    const db = await getDb();
    requireDatabase(db);
    const scopedStoreId = resolveInventoryStore(ctx.user, input?.storeId);

    const labelQuery = db
      .select({
        id: products.id,
        name: products.name,
        retailPrice: products.retailPrice,
        storeId: products.storeId,
        storeName: stores.name,
        barcode: barcodes.value,
      })
      .from(products)
      .innerJoin(stores, eq(products.storeId, stores.id))
      .leftJoin(barcodes, eq(barcodes.productId, products.id));
    const rows = await (scopedStoreId ? labelQuery.where(eq(products.storeId, scopedStoreId)).orderBy(asc(stores.name), asc(products.name)) : labelQuery.orderBy(asc(stores.name), asc(products.name)));

    const catalog = new Map<number, { id: number; name: string; retailPrice: string; storeId: number; storeName: string; barcodes: string[] }>();
    rows.forEach(row => {
      const product = catalog.get(row.id) ?? { id: row.id, name: row.name, retailPrice: row.retailPrice, storeId: row.storeId, storeName: row.storeName, barcodes: [] };
      if (row.barcode) product.barcodes.push(row.barcode);
      catalog.set(row.id, product);
    });
    return Array.from(catalog.values());
  }),

  /** Complete admin catalog. Barcodes are grouped into an array while remaining normalized in storage. */
  productCatalog: stockProcedure.input(optionalInventoryStoreScope).query(async ({ ctx, input }) => {
    await ensureRetailBranches();
    const db = await getDb();
    requireDatabase(db);
    const scopedStoreId = resolveInventoryStore(ctx.user, input?.storeId);

    const storeQuery = db.select({ id: stores.id, name: stores.name }).from(stores);
    const productQuery = db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        reference: products.reference,
        category: products.category,
        variations: products.variations,
        storeId: products.storeId,
        storeName: stores.name,
        purchasePrice: products.lastCostPrice,
        sellingPrice: products.retailPrice,
        stockQuantity: products.quantityOnHand,
        barcode: barcodes.value,
      })
      .from(products)
      .innerJoin(stores, eq(products.storeId, stores.id))
      .leftJoin(barcodes, eq(barcodes.productId, products.id));
    const [storeRows, rows] = await Promise.all([
      scopedStoreId ? storeQuery.where(eq(stores.id, scopedStoreId)).orderBy(asc(stores.name)) : storeQuery.orderBy(asc(stores.name)),
      scopedStoreId ? productQuery.where(eq(products.storeId, scopedStoreId)).orderBy(asc(stores.name), asc(products.name)) : productQuery.orderBy(asc(stores.name), asc(products.name)),
    ]);

    const catalog = new Map<number, { id: number; name: string; sku: string | null; reference: string | null; category: string | null; variations: string | null; storeId: number; storeName: string; purchasePrice: string; sellingPrice: string; stockQuantity: number; barcodes: string[] }>();
    rows.forEach(row => {
      const product = catalog.get(row.id) ?? {
        id: row.id,
        name: row.name,
        sku: row.sku,
        reference: row.reference,
        category: row.category,
        variations: row.variations,
        storeId: row.storeId,
        storeName: row.storeName,
        purchasePrice: row.purchasePrice,
        sellingPrice: row.sellingPrice,
        stockQuantity: row.stockQuantity,
        barcodes: [],
      };
      if (row.barcode) product.barcodes.push(row.barcode);
      catalog.set(row.id, product);
    });
    return { stores: storeRows, products: Array.from(catalog.values()) };
  }),

  /** Fast branch-only lookup for name, barcode, or SKU/reference scans. */
  productSearch: stockProcedure.input(productSearchInput).query(async ({ ctx, input }) => {
    const db = await getDb(); requireDatabase(db);
    const storeId = resolveInventoryStore(ctx.user, input.storeId) ?? input.storeId;
    const query = input.query.trim();
    const match = query ? or(like(products.name, `%${query}%`), like(products.sku, `%${query}%`), like(products.reference, `%${query}%`), like(products.category, `%${query}%`), like(products.variations, `%${query}%`), like(barcodes.value, `%${query}%`)) : undefined;
    const rows = await db.select({ id: products.id, name: products.name, sku: products.sku, reference: products.reference, category: products.category, variations: products.variations, storeId: products.storeId, storeName: stores.name, purchasePrice: products.lastCostPrice, sellingPrice: products.retailPrice, stockQuantity: products.quantityOnHand, barcode: barcodes.value })
      .from(products).innerJoin(stores, eq(products.storeId, stores.id)).leftJoin(barcodes, eq(barcodes.productId, products.id))
      .where(and(eq(products.storeId, storeId), ...(match ? [match] : []))).orderBy(asc(products.name)).limit(input.limit * 10);
    const grouped = new Map<number, { id: number; name: string; sku: string | null; reference: string | null; category: string | null; variations: string | null; storeId: number; storeName: string; purchasePrice: string; sellingPrice: string; stockQuantity: number; barcodes: string[] }>();
    rows.forEach(row => { const product = grouped.get(row.id) ?? { id: row.id, name: row.name, sku: row.sku, reference: row.reference, category: row.category, variations: row.variations, storeId: row.storeId, storeName: row.storeName, purchasePrice: row.purchasePrice, sellingPrice: row.sellingPrice, stockQuantity: row.stockQuantity, barcodes: [] }; if (row.barcode) product.barcodes.push(row.barcode); grouped.set(row.id, product); });
    return Array.from(grouped.values()).slice(0, input.limit);
  }),

  /** Detail follows the product's branch assignment and redacts costs/margins for cashiers. */
  productDetail: protectedProcedure.input(productDetailInput).query(async ({ ctx, input }) => {
    const db = await getDb(); requireDatabase(db);
    const [product] = await db.select({ id: products.id, name: products.name, sku: products.sku, reference: products.reference, description: products.description, storeId: products.storeId, storeName: stores.name, purchasePrice: products.lastCostPrice, sellingPrice: products.retailPrice, stockQuantity: products.quantityOnHand }).from(products).innerJoin(stores, eq(products.storeId, stores.id)).where(eq(products.id, input.productId)).limit(1);
    if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
    const activeRole = isSuperAdmin(ctx.user) ? "super_admin" : requireBranchRole(ctx.user, product.storeId, ["admin", "cashier", "stock_manager", "supervisor"]);
    const canViewFinancials = activeRole === "super_admin" || activeRole === "admin" || activeRole === "stock_manager" || activeRole === "supervisor";
    const productBarcodes = await db.select({ value: barcodes.value }).from(barcodes).where(eq(barcodes.productId, product.id)).orderBy(asc(barcodes.value));
    const base = { id: product.id, name: product.name, sku: product.sku, reference: product.reference, description: product.description, storeId: product.storeId, storeName: product.storeName, stockQuantity: product.stockQuantity, barcodes: productBarcodes.map(row => row.value), canViewFinancials };
    if (!canViewFinancials) return { ...base, sellingPrice: product.sellingPrice };
    const purchasePrice = Number(product.purchasePrice) || 0; const sellingPrice = Number(product.sellingPrice) || 0;
    return { ...base, purchasePrice: product.purchasePrice, sellingPrice: product.sellingPrice, profitMargin: sellingPrice - purchasePrice, profitMarginPercent: purchasePrice > 0 ? ((sellingPrice - purchasePrice) / purchasePrice) * 100 : null };
  }),

  /** Resolves any normalized barcode assigned to a product in the selected inventory branch. Unknown codes are valid new invoice codes. */
  lookupProductByBarcode: stockProcedure.input(inventoryBarcodeLookupInput).query(async ({ ctx, input }) => {
    const db = await getDb();
    requireDatabase(db);
    const storeId = resolveInventoryStore(ctx.user, input.storeId) ?? input.storeId;
    const [match] = await db
      .select({
        id: products.id,
        name: products.name,
        purchasePrice: products.lastCostPrice,
        sellingPrice: products.retailPrice,
        stockQuantity: products.quantityOnHand,
        barcode: barcodes.value,
      })
      .from(barcodes)
      .innerJoin(products, eq(barcodes.productId, products.id))
      .where(and(eq(barcodes.value, input.barcode), eq(products.storeId, storeId)))
      .limit(1);
    return match ?? null;
  }),

  createProduct: stockProcedure.input(createProductInput).mutation(async ({ ctx, input }) => {
    await ensureRetailBranches();
    const db = await getDb();
    requireDatabase(db);
    const storeId = resolveInventoryStore(ctx.user, input.storeId) ?? input.storeId;

    return db.transaction(async tx => {
      const [store] = await tx.select({ id: stores.id }).from(stores).where(eq(stores.id, storeId)).limit(1);
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "The selected branch does not exist." });
      const [duplicateName] = await tx.select({ id: products.id }).from(products).where(and(eq(products.storeId, storeId), eq(products.name, input.name))).limit(1);
      if (duplicateName) throw new TRPCError({ code: "CONFLICT", message: "A product with this name already exists in the selected branch." });

      for (const barcode of input.barcodes) {
        const [existingBarcode] = await tx.select({ productId: barcodes.productId }).from(barcodes).where(eq(barcodes.value, barcode)).limit(1);
        if (existingBarcode) throw new TRPCError({ code: "CONFLICT", message: `Barcode ${barcode} is already assigned to another product.` });
      }

      const result = await tx.insert(products).values({
        storeId,
        name: input.name,
        sku: input.sku || null,
        reference: input.reference || input.sku || null,
        category: input.category || null,
        variations: input.variations || null,
        quantityOnHand: input.stockQuantity,
        lastCostPrice: asMoney(input.purchasePrice),
        retailPrice: asMoney(input.sellingPrice),
        profitMarginPercent: asMarginPercent(input.purchasePrice, input.sellingPrice),
      });
      const productId = Number(result[0].insertId);
      if (input.barcodes.length) await tx.insert(barcodes).values(input.barcodes.map(value => ({ productId, value })));
      return { productId };
    });
  }),

  availableProducts: roleProcedure("cashier").input(availableProductsInput).query(async ({ ctx, input }) => {
    requireBranchRole(ctx.user, input.storeId, ["cashier"]);
    const db = await getDb();
    requireDatabase(db);
    const query = input.query.trim();
    const match = query ? or(like(products.name, `%${query}%`), like(products.sku, `%${query}%`), like(products.reference, `%${query}%`), like(barcodes.value, `%${query}%`)) : undefined;
    const rows = await db.select({ id: products.id, name: products.name, stockQuantity: products.quantityOnHand })
      .from(products)
      .leftJoin(barcodes, eq(barcodes.productId, products.id))
      .where(and(eq(products.storeId, input.storeId), ...(match ? [match] : [])))
      .orderBy(asc(products.name));
    const unique = new Map<number, { id: number; name: string; stockQuantity: number }>();
    for (const row of rows) unique.set(row.id, row);
    return Array.from(unique.values());
  }),

  adjustQuantity: roleProcedure("admin", "cashier").input(quantityAdjustmentInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    requireDatabase(db);
    const [product] = await db.select({ id: products.id, storeId: products.storeId }).from(products).where(eq(products.id, input.productId)).limit(1);
    if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "The selected product no longer exists." });
    requireBranchRole(ctx.user, product.storeId, ["admin", "cashier"]);
    await db.update(products).set({ quantityOnHand: input.stockQuantity }).where(eq(products.id, product.id));
    return { productId: product.id, stockQuantity: input.stockQuantity };
  }),

  updateProduct: stockProcedure.input(updateProductInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    requireDatabase(db);

    return db.transaction(async tx => {
      const [product] = await tx.select({ id: products.id, storeId: products.storeId }).from(products).where(eq(products.id, input.productId)).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "The selected product no longer exists." });
      resolveInventoryStore(ctx.user, product.storeId);

      const [duplicateName] = await tx.select({ id: products.id }).from(products).where(and(eq(products.storeId, product.storeId), eq(products.name, input.name))).limit(1);
      if (duplicateName && duplicateName.id !== product.id) throw new TRPCError({ code: "CONFLICT", message: "A product with this name already exists in this branch." });

      const existingBarcodes = await tx.select({ id: barcodes.id, value: barcodes.value }).from(barcodes).where(eq(barcodes.productId, product.id));
      const existingValues = new Set(existingBarcodes.map(row => row.value));
      for (const barcode of input.barcodes.filter(value => !existingValues.has(value))) {
        const [assignedBarcode] = await tx.select({ productId: barcodes.productId }).from(barcodes).where(eq(barcodes.value, barcode)).limit(1);
        if (assignedBarcode && assignedBarcode.productId !== product.id) throw new TRPCError({ code: "CONFLICT", message: `Barcode ${barcode} is already assigned to another product.` });
      }

      await tx.update(products).set({
        name: input.name,
        sku: input.sku || null,
        reference: input.reference || input.sku || null,
        category: input.category || null,
        variations: input.variations || null,
        quantityOnHand: input.stockQuantity,
        lastCostPrice: asMoney(input.purchasePrice),
        retailPrice: asMoney(input.sellingPrice),
        profitMarginPercent: asMarginPercent(input.purchasePrice, input.sellingPrice),
      }).where(eq(products.id, product.id));

      const wantedBarcodes = new Set(input.barcodes);
      const removable = existingBarcodes.filter(row => !wantedBarcodes.has(row.value));
      if (removable.length) await tx.delete(barcodes).where(and(eq(barcodes.productId, product.id), inArray(barcodes.id, removable.map(row => row.id))));
      const newBarcodes = input.barcodes.filter(value => !existingValues.has(value));
      if (newBarcodes.length) await tx.insert(barcodes).values(newBarcodes.map(value => ({ productId: product.id, value })));
      return { productId: product.id };
    });
  }),

  deleteProducts: stockProcedure.input(z.object({ productIds: z.array(z.number().int().positive()).min(1).max(100) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    requireDatabase(db);
    return db.transaction(async tx => {
      const rows = await tx.select({ id: products.id, storeId: products.storeId, name: products.name }).from(products).where(inArray(products.id, input.productIds));
      if (rows.length !== input.productIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "One or more selected products no longer exist." });
      rows.forEach(row => resolveInventoryStore(ctx.user, row.storeId));
      const history = await tx.select({ productId: stockEntries.productId }).from(stockEntries).where(inArray(stockEntries.productId, input.productIds));
      const invoiceHistory = await tx.select({ productId: supplierInvoiceLines.productId }).from(supplierInvoiceLines).where(inArray(supplierInvoiceLines.productId, input.productIds));
      const salesHistory = await tx.select({ productId: saleLines.productId }).from(saleLines).where(inArray(saleLines.productId, input.productIds));
      if (history.length || invoiceHistory.length || salesHistory.length) throw new TRPCError({ code: "CONFLICT", message: "Products with stock, invoice, or sales history cannot be deleted. Remove the related invoice line or reverse the stock first." });
      await tx.delete(products).where(inArray(products.id, input.productIds));
      return { deleted: rows.length };
    });
  }),

  analytics: adminProcedure.input(analyticsInput).query(async ({ input }) => {
    await ensureRetailBranches();
    const db = await getDb();
    requireDatabase(db);
    const storeScope = input.storeId ? eq(stores.id, input.storeId) : undefined;
    const saleScope = input.storeId ? eq(sales.storeId, input.storeId) : undefined;
    const saleLineScope = input.storeId ? eq(saleLines.storeId, input.storeId) : undefined;
    const returnScope = input.storeId ? eq(saleReturns.storeId, input.storeId) : undefined;
    const productScope = input.storeId ? eq(products.storeId, input.storeId) : undefined;

    const expenseScope = input.storeId ? and(eq(operationalExpenses.storeId, input.storeId), eq(operationalExpenses.status, "posted")) : eq(operationalExpenses.status, "posted");
    const [storeRows, salesRows, saleLineRows, returnRows, lowStockRows, expenseRows] = await Promise.all([
      db.select({ id: stores.id, name: stores.name, type: stores.type }).from(stores).where(storeScope).orderBy(asc(stores.name)),
      db.select({ id: sales.id, storeId: sales.storeId, storeName: stores.name, cashierName: users.name, total: sales.total, createdAt: sales.createdAt })
        .from(sales).innerJoin(stores, eq(sales.storeId, stores.id)).leftJoin(users, eq(sales.cashierUserId, users.id)).where(saleScope).orderBy(desc(sales.createdAt)),
      db.select({ saleId: saleLines.saleId, storeId: saleLines.storeId, quantity: saleLines.quantity, unitPrice: saleLines.unitPrice, unitCost: saleLines.unitCost, unitDiscount: saleLines.unitDiscount })
        .from(saleLines).where(saleLineScope),
      db.select({ saleId: saleReturns.saleId, storeId: saleReturns.storeId, quantity: returnLines.quantity, unitRefund: returnLines.unitRefund, unitCost: saleLines.unitCost })
        .from(returnLines).innerJoin(saleReturns, eq(returnLines.returnId, saleReturns.id)).innerJoin(saleLines, eq(returnLines.saleLineId, saleLines.id)).where(returnScope),
      db.select({ id: products.id, name: products.name, quantityOnHand: products.quantityOnHand, storeId: products.storeId, storeName: stores.name, lastCostPrice: products.lastCostPrice })
        .from(products).innerJoin(stores, eq(products.storeId, stores.id)).where(productScope ? and(productScope, lt(products.quantityOnHand, input.lowStockThreshold)) : lt(products.quantityOnHand, input.lowStockThreshold)).orderBy(asc(products.quantityOnHand), asc(products.name)),
      db.select({ storeId: operationalExpenses.storeId, amount: operationalExpenses.amount }).from(operationalExpenses).where(expenseScope),
    ]);

    return calculateAnalytics({ stores: storeRows, sales: salesRows, saleLines: saleLineRows, returnLines: returnRows, lowStock: lowStockRows, expenses: expenseRows });
  }),

  /** Durable completed checkout archive. Invoice and line snapshots never depend on later product edits. */
  salesArchive: adminProcedure.input(salesArchiveInput).query(async ({ input }) => {
    const db = await getDb();
    requireDatabase(db);
    const search = input.search.trim();
    const searchScope = search ? or(like(sales.invoiceNumber, `%${search}%`), like(sales.receiptNumber, `%${search}%`)) : undefined;
    const storeScope = input.storeId ? eq(sales.storeId, input.storeId) : undefined;
    const fromScope = input.from ? gte(sales.createdAt, input.from) : undefined;
    const toScope = input.to ? lte(sales.createdAt, input.to) : undefined;
    const rows = await db
      .select({ id: sales.id, invoiceNumber: sales.invoiceNumber, receiptNumber: sales.receiptNumber, storeId: sales.storeId, storeName: stores.name, cashierName: users.name, paymentMethod: sales.paymentMethod, subtotal: sales.subtotal, discountTotal: sales.discountTotal, total: sales.total, createdAt: sales.createdAt })
      .from(sales)
      .innerJoin(stores, eq(sales.storeId, stores.id))
      .leftJoin(users, eq(sales.cashierUserId, users.id))
      .where(and(storeScope, searchScope, fromScope, toScope))
      .orderBy(desc(sales.createdAt))
      .limit(input.limit);
    const saleIds = rows.map(row => row.id);
    const lines = saleIds.length ? await db.select({ saleId: saleLines.saleId, quantity: saleLines.quantity }).from(saleLines).where(inArray(saleLines.saleId, saleIds)) : [];
    const itemCountBySale = new Map<number, number>();
    lines.forEach(line => itemCountBySale.set(line.saleId, (itemCountBySale.get(line.saleId) ?? 0) + line.quantity));
    return rows.map(row => ({ ...row, itemCount: itemCountBySale.get(row.id) ?? 0 }));
  }),

  /** Returns an exact persisted checkout invoice with its immutable line-level price snapshots. */
  salesInvoiceDetail: adminProcedure.input(salesInvoiceDetailInput).query(async ({ input }) => {
    const db = await getDb();
    requireDatabase(db);
    const [invoice] = await db
      .select({ id: sales.id, invoiceNumber: sales.invoiceNumber, receiptNumber: sales.receiptNumber, storeId: sales.storeId, storeName: stores.name, cashierName: users.name, paymentMethod: sales.paymentMethod, subtotal: sales.subtotal, discountTotal: sales.discountTotal, total: sales.total, createdAt: sales.createdAt })
      .from(sales)
      .innerJoin(stores, eq(sales.storeId, stores.id))
      .leftJoin(users, eq(sales.cashierUserId, users.id))
      .where(eq(sales.id, input.saleId))
      .limit(1);
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "The requested sales invoice no longer exists." });
    const lines = await db
      .select({ id: saleLines.id, productId: saleLines.productId, productName: saleLines.productName, quantity: saleLines.quantity, unitPrice: saleLines.unitPrice, unitCost: saleLines.unitCost, unitDiscount: saleLines.unitDiscount, lineTotal: saleLines.lineTotal })
      .from(saleLines)
      .where(eq(saleLines.saleId, invoice.id))
      .orderBy(asc(saleLines.id));
    return { invoice, lines };
  }),

  generateProductBarcode: stockProcedure.input(z.object({ productId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    requireDatabase(db);
    return db.transaction(async tx => {
      const [product] = await tx.select({ id: products.id, storeId: products.storeId }).from(products).where(eq(products.id, input.productId)).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "The selected product no longer exists." });
      resolveInventoryStore(ctx.user, product.storeId);
      const [assigned] = await tx.select({ value: barcodes.value }).from(barcodes).where(eq(barcodes.productId, product.id)).limit(1);
      if (assigned) return { barcode: assigned.value };
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const barcode = `ADAM${randomInt(100000000000, 999999999999)}`;
        const [existing] = await tx.select({ productId: barcodes.productId }).from(barcodes).where(eq(barcodes.value, barcode)).limit(1);
        if (existing) continue;
        await tx.insert(barcodes).values({ productId: product.id, value: barcode });
        return { barcode };
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not generate a unique barcode. Please try again." });
    });
  }),

  assignLabelBarcode: stockProcedure
    .input(z.object({ productId: z.number().int().positive(), barcode: z.string().trim().min(3).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      requireDatabase(db);
      const [product] = await db.select({ id: products.id, storeId: products.storeId }).from(products).where(eq(products.id, input.productId)).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "The selected product no longer exists." });
      resolveInventoryStore(ctx.user, product.storeId);
      const [existing] = await db.select().from(barcodes).where(eq(barcodes.value, input.barcode)).limit(1);
      if (existing && existing.productId !== product.id) {
        throw new TRPCError({ code: "CONFLICT", message: "This barcode is already assigned to another product." });
      }
      if (!existing) await db.insert(barcodes).values({ productId: product.id, value: input.barcode });
      return { barcode: input.barcode };
    }),

  parseInvoice: stockProcedure
    .input(
      z.object({
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.enum(permittedInvoiceMimeTypes),
        dataUrl: z.string().min(32).max(12_000_000),
        referenceSource: z.enum(["product_name", "separate_column", "separate_area"] satisfies [ReferenceSource, ...ReferenceSource[]]).default("product_name"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const parsed = await parseInvoiceWithVision({ userId: ctx.user.id, ...input });
      const db = await getDb();
      requireDatabase(db);
      const reviewSessionId = randomUUID();
      await db.insert(invoiceReviewSessions).values({
        id: reviewSessionId,
        uploadedByUserId: ctx.user.id,
        sourceFileKey: parsed.sourceFileKey,
        extractionPayload: JSON.stringify(parsed.extraction),
        exceptionsPayload: JSON.stringify(parsed.exceptions),
      });
      // The exact structured contract is exposed verbatim; `items` is a UI convenience projection.
      return { ...parsed, reviewSessionId };
    }),

  commitInvoice: stockProcedure.input(commitInvoiceInput).mutation(async ({ ctx, input }) => {
    if (!input.sourceFileKey.startsWith(`invoice-sources/${ctx.user.id}/`)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "The invoice source does not belong to the signed-in administrator." });
    }

    await ensureRetailBranches();
    const db = await getDb();
    requireDatabase(db);
    const storeId = resolveInventoryStore(ctx.user, input.storeId) ?? input.storeId;

    return db.transaction(async tx => {
      const [reviewSession] = await tx.select().from(invoiceReviewSessions)
        .where(and(eq(invoiceReviewSessions.id, input.reviewSessionId), eq(invoiceReviewSessions.uploadedByUserId, ctx.user.id))).limit(1);
      if (!reviewSession || reviewSession.sourceFileKey !== input.sourceFileKey) {
        throw new TRPCError({ code: "FORBIDDEN", message: "The invoice review session is missing, expired, or belongs to another source document." });
      }
      let extraction: unknown;
      let exceptions: Array<{ sourceIndex: number; kind: "missing_reference" | "uncertain_item" | "abnormal_value" | "unmapped_layout"; question: string }>;
      try {
        extraction = JSON.parse(reviewSession.extractionPayload);
        exceptions = z.array(z.object({ sourceIndex: z.number().int().nonnegative(), kind: z.enum(["missing_reference", "uncertain_item", "abnormal_value", "unmapped_layout"]), question: z.string().min(1).max(500) })).parse(JSON.parse(reviewSession.exceptionsPayload));
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The stored invoice review data is invalid. Re-run invoice extraction before committing." });
      }
      const decisions = new Map(input.exceptionDecisions.map(decision => [decision.sourceIndex, decision]));
      if (decisions.size !== input.exceptionDecisions.length || exceptions.some(exception => !decisions.has(exception.sourceIndex))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Answer every invoice exception before saving stock." });
      }
      for (const exception of exceptions) {
        const decision = decisions.get(exception.sourceIndex)!;
        const lineExists = input.items.some(line => line.sourceIndex === exception.sourceIndex);
        if ((decision.decision === "exclude" && lineExists) || (decision.decision !== "exclude" && !lineExists)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The reviewed invoice lines do not match your exception decisions." });
        }
      }
      const [targetStore] = await tx.select().from(stores).where(eq(stores.id, storeId)).limit(1);
      if (!targetStore) throw new TRPCError({ code: "NOT_FOUND", message: "The selected branch does not exist." });

      let supplier = input.supplierId
        ? (await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1))[0]
        : (await tx.select().from(suppliers).where(eq(suppliers.name, input.supplierName)).limit(1))[0];
      if (!supplier && input.supplierId) throw new TRPCError({ code: "NOT_FOUND", message: "The selected supplier could not be found." });
      if (!supplier) {
        const result = await tx.insert(suppliers).values({ name: input.supplierName });
        const supplierId = Number(result[0].insertId);
        [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);
      }
      if (!supplier) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The supplier could not be created." });

      const totalCost = asMoney(input.items.reduce((total, item) => total + item.quantity * item.costPrice, 0));
      const totalAmount = asMoney(input.totalAmount ?? Number(totalCost));
      if (input.amountPaid > Number(totalAmount)) throw new TRPCError({ code: "BAD_REQUEST", message: "Amount paid cannot exceed the supplier invoice total." });
      const amountPaid = asMoney(input.amountPaid);
      const remainingDebt = asMoney(Number(totalAmount) - Number(amountPaid));
      const invoiceResult = await tx.insert(invoices).values({
        storeId,
        supplierId: supplier.id,
        uploadedByUserId: ctx.user.id,
        sourceFileKey: input.sourceFileKey,
        sourceMimeType: input.sourceMimeType,
        originalFileName: input.originalFileName,
        totalCost,
        totalAmount,
        amountPaid,
        remainingDebt,
        extractionPayload: JSON.stringify({ extraction, submittedItems: input.items, exceptionDecisions: input.exceptionDecisions }),
      });
      const invoiceId = Number(invoiceResult[0].insertId);

      if (exceptions.length) {
        await tx.insert(invoiceExceptionDecisions).values(exceptions.map(exception => ({
          invoiceId,
          storeId,
          sourceIndex: exception.sourceIndex,
          kind: exception.kind,
          question: exception.question,
          decision: decisions.get(exception.sourceIndex)!.decision,
          resolvedByUserId: ctx.user.id,
        })));
      }

      if (Number(amountPaid) > 0) {
        const paidAt = new Date();
        const paymentResult = await tx.insert(supplierPayments).values({
          supplierId: supplier.id,
          storeId,
          recordedByUserId: ctx.user.id,
          amount: amountPaid,
          paymentMethod: "cash",
          notes: "Recorded with supplier invoice intake.",
          paidAt,
        });
        const paymentId = Number(paymentResult[0].insertId);
        await tx.insert(supplierPaymentAllocations).values({ paymentId, invoiceId, amount: amountPaid });
        await tx.insert(supplierInvoicePayments).values({ invoiceId, storeId, recordedByUserId: ctx.user.id, amount: amountPaid, paymentMethod: "cash", notes: "Recorded with supplier invoice intake.", paidAt });
      }
      if (Number(remainingDebt) > 0) {
        await tx.update(suppliers).set({ currentDebt: sql`${suppliers.currentDebt} + ${remainingDebt}` }).where(eq(suppliers.id, supplier.id));
      }

      for (const line of input.items) {
        let [product] = await tx
          .select()
          .from(products)
          .where(and(eq(products.storeId, storeId), eq(products.name, line.productName)))
          .limit(1);

        if (!product) {
          const created = await tx.insert(products).values({
            storeId,
            name: line.productName,
            sku: line.reference || null,
            reference: line.reference || null,
            quantityOnHand: line.quantity,
            lastCostPrice: asMoney(line.costPrice),
            retailPrice: asMoney(line.sellingPrice),
            profitMarginPercent: asMoney(line.profitMarginPercent),
            profitMarginEnabled: line.profitMarginEnabled,
          });
          const productId = Number(created[0].insertId);
          [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
        } else {
          await tx
            .update(products)
            .set({
              quantityOnHand: sql`${products.quantityOnHand} + ${line.quantity}`,
              lastCostPrice: asMoney(line.costPrice),
              retailPrice: asMoney(line.sellingPrice),
              profitMarginPercent: asMoney(line.profitMarginPercent),
              profitMarginEnabled: line.profitMarginEnabled,
              ...(line.reference && !product.reference ? { reference: line.reference } : {}),
              ...(line.reference && !product.sku ? { sku: line.reference } : {}),
            })
            .where(eq(products.id, product.id));
        }
        if (!product) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The product could not be created." });

        const lineBarcodes = Array.from(new Set([...line.barcodes, ...(line.barcode ? [line.barcode] : [])]));
        for (const barcode of lineBarcodes) {
          const [existingBarcode] = await tx.select().from(barcodes).where(eq(barcodes.value, barcode)).limit(1);
          if (existingBarcode && existingBarcode.productId !== product.id) {
            throw new TRPCError({ code: "CONFLICT", message: `Barcode ${barcode} is already linked to another product.` });
          }
          if (!existingBarcode) await tx.insert(barcodes).values({ productId: product.id, value: barcode });
        }

        await tx.insert(stockEntries).values({
          invoiceId,
          productId: product.id,
          storeId,
          quantity: line.quantity,
          unitCost: asMoney(line.costPrice),
        });
        await tx.insert(supplierInvoiceLines).values({
          invoiceId,
          productId: product.id,
          storeId,
          productName: line.productName,
          reference: line.reference || null,
          quantity: line.quantity,
          unitCost: asMoney(line.costPrice),
          sellingPrice: asMoney(line.sellingPrice),
          profitMarginPercent: asMoney(line.profitMarginPercent),
          profitMarginEnabled: line.profitMarginEnabled,
          lineTotal: asMoney(line.quantity * line.costPrice),
        });
      }

      await tx.delete(invoiceReviewSessions).where(eq(invoiceReviewSessions.id, reviewSession.id));

      return { invoiceId, supplierId: supplier.id, supplierName: supplier.name, storeName: targetStore.name, committedLines: input.items.length, totalAmount: Number(totalAmount), amountPaid: Number(amountPaid), remainingDebt: Number(remainingDebt) };
    });
  }),

  /** Legacy non-routed POS entry can resolve only one permitted cashier/supervisor branch. */
  cashierWorkspace: protectedProcedure.query(async ({ ctx }) => {
    const storesForPos = assignedStoresForRoles(ctx.user, ["cashier", "supervisor", "admin"]);
    if (!storesForPos.length || storesForPos.length > 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Select one permitted branch before opening POS." });
    const db = await getDb();
    requireDatabase(db);
    const [store] = await db.select().from(stores).where(eq(stores.id, storesForPos[0])).limit(1);
    if (!store) throw new TRPCError({ code: "FORBIDDEN", message: "The assigned branch is unavailable." });
    return store;
  }),
});

export const invoiceExtractionContract = invoiceExtractionSchema;
