import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { barcodes, customerDebtTransactions, customers, directReturnLines, directReturns, products, quickKeys, returnLines, saleLines, saleReturns, sales, shifts } from "../../drizzle/schema";
import { getDb } from "../db";
import { assignedStoresForRoles, isSuperAdmin, posProcedure, requireBranchRole, roleProcedure, router, supervisorProcedure } from "../_core/trpc";

const paymentMethodSchema = z.enum(["cash", "card", "mobile", "credit", "other"]);
const previewScopeSchema = z.object({ previewStoreId: z.number().int().positive().optional() });
const quickKeyCharacterSchema = z.string().trim().regex(/^[A-Za-z0-9]$/, "Quick Keys must be one letter or number.").transform(value => value.toUpperCase());
const quickKeyMutationInput = previewScopeSchema.extend({ keyCharacter: quickKeyCharacterSchema, productId: z.number().int().positive().nullable() });
const quickKeyProductSearchInput = previewScopeSchema.extend({ query: z.string().trim().max(120).default(""), limit: z.number().int().min(1).max(25).default(12) });
const RESERVED_QUICK_KEYS = new Set(["F2", "F4", "F8", "ENTER"]);
const inventoryCheckoutLineSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(1000),
  unitDiscount: z.number().finite().nonnegative().max(999_999.99).default(0),
});
const customCheckoutLineSchema = z.object({
  customName: z.string().trim().min(1).max(255),
  customAmount: z.number().finite().positive().max(999_999.99),
  quantity: z.number().int().positive().max(1000).default(1),
  unitDiscount: z.number().finite().nonnegative().max(999_999.99).default(0),
});
const checkoutLineSchema = z.union([inventoryCheckoutLineSchema, customCheckoutLineSchema]);

const checkoutInput = z.object({
  previewStoreId: z.number().int().positive().optional(),
  customerId: z.number().int().positive().optional(),
  creditCustomer: z.object({ firstName: z.string().trim().min(1).max(120), lastName: z.string().trim().min(1).max(120), phone: z.string().trim().min(4).max(64) }).optional(),
  amountPaidNow: z.number().finite().nonnegative().max(999_999_999).default(0),
  paymentMethod: paymentMethodSchema,
  items: z.array(checkoutLineSchema).min(1).max(100),
}).superRefine((value, ctx) => {
  const ids = value.items.filter((item): item is z.infer<typeof inventoryCheckoutLineSchema> => "productId" in item).map(item => item.productId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Each product may appear only once in a checkout." });
  if (value.paymentMethod === "credit" && !value.customerId && !value.creditCustomer) ctx.addIssue({ code: "custom", path: ["customerId"], message: "Credit checkout requires an existing or new customer profile." });
});

const returnInput = z.object({
  previewStoreId: z.number().int().positive().optional(),
  saleId: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
  items: z.array(z.object({ saleLineId: z.number().int().positive(), quantity: z.number().int().positive().max(1000) })).min(1).max(100),
}).superRefine((value, ctx) => {
  const ids = value.items.map(item => item.saleLineId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Each receipt line may be returned only once per request." });
});

const directReturnInput = z.object({
  previewStoreId: z.number().int().positive().optional(),
  reason: z.string().trim().max(500).optional(),
  items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive().max(1000) })).min(1).max(100),
}).superRefine((value, ctx) => {
  const ids = value.items.map(item => item.productId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Each product may appear only once in a direct return." });
});

function resolvePosStore(user: Parameters<typeof requireBranchRole>[0], previewStoreId?: number): number {
  if (isSuperAdmin(user)) {
    if (!previewStoreId) throw new TRPCError({ code: "BAD_REQUEST", message: "Super Admin POS preview requires a selected branch." });
    return previewStoreId;
  }
  const allowedStores = assignedStoresForRoles(user, ["admin", "cashier", "supervisor"]);
  const storeId = previewStoreId ?? (allowedStores.length === 1 ? allowedStores[0] : undefined);
  if (!storeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select a permitted POS branch before continuing." });
  requireBranchRole(user, storeId, ["admin", "cashier", "supervisor"]);
  return storeId;
}

function isCashierAtBranch(user: Parameters<typeof requireBranchRole>[0], storeId: number) {
  return !isSuperAdmin(user) && requireBranchRole(user, storeId, ["admin", "cashier", "supervisor"]) === "cashier";
}

function requireDatabase<T>(db: T): asserts db is Exclude<T, null> {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database service is unavailable." });
}

function money(value: number): string {
  return Math.max(0, value).toFixed(2);
}

function receiptNumber(storeId: number): string {
  return `RCT-${storeId}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
}

function invoiceNumber(saleId: number): string {
  return String(saleId).padStart(12, "0");
}

function directReturnNumber(storeId: number): string {
  return `DRT-${storeId}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
}

/** Cashier APIs are branch-bound; Admin access is allowed only through an explicit selected preview branch. */
export const posRouter = router({
  quickKeyMappings: posProcedure
    .input(previewScopeSchema)
    .query(async ({ ctx, input }) => {
      const storeId = resolvePosStore(ctx.user, input.previewStoreId);
      const db = await getDb();
      requireDatabase(db);
      return db.select({ keyCharacter: quickKeys.keyCharacter, productId: quickKeys.productId, productName: products.name, sku: products.sku, barcode: barcodes.value })
        .from(quickKeys)
        .innerJoin(products, eq(products.id, quickKeys.productId))
        .leftJoin(barcodes, eq(barcodes.productId, products.id))
        .where(eq(quickKeys.storeId, storeId))
        .orderBy(quickKeys.keyCharacter);
    }),

  /** Admin-only lookup for scalable Quick Key assignment by product name or any barcode. */
  quickKeyProductSearch: posProcedure
    .input(quickKeyProductSearchInput)
    .query(async ({ ctx, input }) => {
      const storeId = resolvePosStore(ctx.user, input.previewStoreId);
      if (!isSuperAdmin(ctx.user)) requireBranchRole(ctx.user, storeId, ["admin"]);
      const db = await getDb();
      requireDatabase(db);
      const query = input.query.trim();
      const match = query ? or(like(products.name, `%${query}%`), like(products.sku, `%${query}%`), like(barcodes.value, `%${query}%`)) : undefined;
      const rows = await db.select({ id: products.id, name: products.name, sku: products.sku, barcode: barcodes.value, quantityOnHand: products.quantityOnHand })
        .from(products)
        .leftJoin(barcodes, eq(barcodes.productId, products.id))
        .where(and(eq(products.storeId, storeId), ...(match ? [match] : [])))
        .orderBy(products.name)
        .limit(input.limit * 3);
      const catalog = new Map<number, { id: number; name: string; sku: string | null; barcodes: string[]; quantityOnHand: number }>();
      for (const row of rows) {
        const product = catalog.get(row.id) ?? { id: row.id, name: row.name, sku: row.sku, barcodes: [], quantityOnHand: row.quantityOnHand };
        if (row.barcode && !product.barcodes.includes(row.barcode)) product.barcodes.push(row.barcode);
        catalog.set(row.id, product);
      }
      return Array.from(catalog.values()).slice(0, input.limit);
    }),

  setQuickKey: posProcedure
    .input(quickKeyMutationInput)
    .mutation(async ({ ctx, input }) => {
      const storeId = resolvePosStore(ctx.user, input.previewStoreId);
      if (!isSuperAdmin(ctx.user)) requireBranchRole(ctx.user, storeId, ["admin"]);
      const keyCharacter = input.keyCharacter;
      if (RESERVED_QUICK_KEYS.has(keyCharacter)) throw new TRPCError({ code: "BAD_REQUEST", message: "This system key is reserved." });
      const db = await getDb();
      requireDatabase(db);
      return db.transaction(async tx => {
        const [existingKey] = await tx.select({ id: quickKeys.id, productId: quickKeys.productId }).from(quickKeys).where(and(eq(quickKeys.storeId, storeId), eq(quickKeys.keyCharacter, keyCharacter))).limit(1);
        if (input.productId === null) {
          if (existingKey) await tx.delete(quickKeys).where(eq(quickKeys.id, existingKey.id));
          return { keyCharacter, productId: null };
        }
        const [product] = await tx.select({ id: products.id }).from(products).where(and(eq(products.id, input.productId), eq(products.storeId, storeId))).limit(1);
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "The selected product is not in this branch." });
        if (existingKey && existingKey.productId !== input.productId) throw new TRPCError({ code: "CONFLICT", message: "That Quick Key is already assigned to another product." });
        const [existingProduct] = await tx.select({ id: quickKeys.id, keyCharacter: quickKeys.keyCharacter }).from(quickKeys).where(and(eq(quickKeys.storeId, storeId), eq(quickKeys.productId, input.productId))).limit(1);
        if (existingProduct && existingProduct.keyCharacter !== keyCharacter) throw new TRPCError({ code: "CONFLICT", message: "This product already has another Quick Key." });
        if (existingKey) await tx.update(quickKeys).set({ productId: input.productId }).where(eq(quickKeys.id, existingKey.id));
        else await tx.insert(quickKeys).values({ storeId, keyCharacter, productId: input.productId });
        return { keyCharacter, productId: input.productId };
      });
    }),

  quickKeyProducts: posProcedure
    .input(previewScopeSchema)
    .query(async ({ ctx, input }) => {
      const storeId = resolvePosStore(ctx.user, input.previewStoreId);
      const db = await getDb();
      requireDatabase(db);
      const rows = await db.select({ id: products.id, name: products.name, quantityOnHand: products.quantityOnHand, retailPrice: products.retailPrice, barcode: barcodes.value })
        .from(products).leftJoin(barcodes, eq(barcodes.productId, products.id))
        .where(eq(products.storeId, storeId))
        .orderBy(products.name);
      const catalog = new Map<number, { id: number; name: string; quantityOnHand: number; retailPrice: string; barcode: string }>();
      for (const row of rows) if (!catalog.has(row.id)) catalog.set(row.id, { id: row.id, name: row.name, quantityOnHand: row.quantityOnHand, retailPrice: row.retailPrice, barcode: row.barcode ?? "" });
      return Array.from(catalog.values()).slice(0, 26);
    }),

  lookupBarcode: posProcedure
    .input(previewScopeSchema.extend({ barcode: z.string().trim().min(3).max(128) }))
    .query(async ({ ctx, input }) => {
      const storeId = resolvePosStore(ctx.user, input.previewStoreId);
      const db = await getDb();
      requireDatabase(db);

      const [match] = await db
        .select({
          id: products.id,
          name: products.name,
          quantityOnHand: products.quantityOnHand,
          retailPrice: products.retailPrice,
          barcode: barcodes.value,
        })
        .from(barcodes)
        .innerJoin(products, eq(barcodes.productId, products.id))
        .where(and(eq(barcodes.value, input.barcode), eq(products.storeId, storeId)))
        .limit(1);

      if (!match) throw new TRPCError({ code: "NOT_FOUND", message: "No product in this branch matches that barcode." });
      if (match.quantityOnHand <= 0) throw new TRPCError({ code: "CONFLICT", message: `${match.name} is out of stock.` });
      return match;
    }),

  lookupReference: posProcedure
    .input(previewScopeSchema.extend({ reference: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9À-ÖØ-öø-ÿ]+$/, "Reference must be alphanumeric.") }))
    .query(async ({ ctx, input }) => {
      const storeId = resolvePosStore(ctx.user, input.previewStoreId);
      const db = await getDb();
      requireDatabase(db);

      const [match] = await db
        .select({
          id: products.id,
          name: products.name,
          quantityOnHand: products.quantityOnHand,
          retailPrice: products.retailPrice,
          barcode: barcodes.value,
        })
        .from(products)
        .leftJoin(barcodes, eq(barcodes.productId, products.id))
        .where(and(eq(products.reference, input.reference), eq(products.storeId, storeId)))
        .limit(1);

      if (!match) throw new TRPCError({ code: "NOT_FOUND", message: "No product in this branch matches that reference." });
      if (match.quantityOnHand <= 0) throw new TRPCError({ code: "CONFLICT", message: `${match.name} is out of stock.` });
      return { ...match, barcode: match.barcode ?? "" };
    }),

  /** Return lookup intentionally permits zero on-hand quantity because returned stock is being received. */
  lookupReturnBarcode: posProcedure
    .input(previewScopeSchema.extend({ barcode: z.string().trim().min(3).max(128) }))
    .query(async ({ ctx, input }) => {
      const storeId = resolvePosStore(ctx.user, input.previewStoreId);
      const db = await getDb();
      requireDatabase(db);
      const [match] = await db
        .select({ id: products.id, name: products.name, quantityOnHand: products.quantityOnHand, retailPrice: products.retailPrice, barcode: barcodes.value })
        .from(barcodes)
        .innerJoin(products, eq(barcodes.productId, products.id))
        .where(and(eq(barcodes.value, input.barcode), eq(products.storeId, storeId)))
        .limit(1);
      if (!match) throw new TRPCError({ code: "NOT_FOUND", message: "No product in this branch matches that barcode." });
      return match;
    }),

  checkout: posProcedure.input(checkoutInput).mutation(async ({ ctx, input }) => {
    const storeId = resolvePosStore(ctx.user, input.previewStoreId);
    const db = await getDb();
    requireDatabase(db);

    return db.transaction(async tx => {
      const [activeShift] = isCashierAtBranch(ctx.user, storeId)
        ? await tx.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.storeId, storeId), eq(shifts.cashierUserId, ctx.user.id), eq(shifts.status, "open"))).limit(1)
        : [];
      if (isCashierAtBranch(ctx.user, storeId) && !activeShift) {
        throw new TRPCError({ code: "CONFLICT", message: "A supervisor must open your branch shift before checkout can be completed." });
      }
      let resolvedCustomerId = input.customerId ?? null;
      let resolvedCustomerName: string | null = null;
      if (input.paymentMethod === "credit" && input.creditCustomer) {
        const [existing] = await tx.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.phone, input.creditCustomer.phone)).limit(1);
        if (existing) { resolvedCustomerId = existing.id; resolvedCustomerName = existing.name; }
        else {
          const created = await tx.insert(customers).values({ firstName: input.creditCustomer.firstName, lastName: input.creditCustomer.lastName, name: `${input.creditCustomer.firstName} ${input.creditCustomer.lastName}`.trim(), phone: input.creditCustomer.phone });
          resolvedCustomerId = Number(created[0].insertId);
          resolvedCustomerName = `${input.creditCustomer.firstName} ${input.creditCustomer.lastName}`.trim();
        }
      }
      if (resolvedCustomerId) {
        const [customer] = await tx.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.id, resolvedCustomerId)).limit(1);
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "The selected customer record could not be found." });
        resolvedCustomerName = customer.name;
      }
      const inventoryItems = input.items.filter((item): item is z.infer<typeof inventoryCheckoutLineSchema> => "productId" in item);
      const customItems = input.items.filter((item): item is z.infer<typeof customCheckoutLineSchema> => "customAmount" in item);
      const productIds = inventoryItems.map(item => item.productId);
      const catalog = productIds.length ? await tx.select().from(products).where(and(eq(products.storeId, storeId), inArray(products.id, productIds))) : [];
      if (catalog.length !== inventoryItems.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "One or more cart products are no longer available in this branch." });
      }

      const inventoryLines = inventoryItems.map(item => {
        const product = catalog.find(candidate => candidate.id === item.productId);
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "A cart product is no longer available." });
        if (product.quantityOnHand < item.quantity) {
          throw new TRPCError({ code: "CONFLICT", message: `Insufficient stock for ${product.name}.` });
        }
        const unitPrice = Number(product.retailPrice);
        if (item.unitDiscount > unitPrice) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Discount for ${product.name} cannot exceed its unit price.` });
        }
        return { product, productName: product.name, quantity: item.quantity, unitPrice, unitCost: Number(product.lastCostPrice), unitDiscount: item.unitDiscount, lineTotal: (unitPrice - item.unitDiscount) * item.quantity };
      });
      const customLines = customItems.map(item => {
        if (item.unitDiscount > item.customAmount) throw new TRPCError({ code: "BAD_REQUEST", message: `Discount for ${item.customName} cannot exceed its custom amount.` });
        return { product: null, productName: item.customName, quantity: item.quantity, unitPrice: item.customAmount, unitCost: 0, unitDiscount: item.unitDiscount, lineTotal: (item.customAmount - item.unitDiscount) * item.quantity };
      });
      const lines = [...inventoryLines, ...customLines];

      const subtotal = lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
      const discountTotal = lines.reduce((total, line) => total + line.unitDiscount * line.quantity, 0);
      const total = subtotal - discountTotal;
      const amountPaid = input.paymentMethod === "credit" ? Math.min(total, input.amountPaidNow) : total;
      if (input.paymentMethod === "credit" && input.amountPaidNow > total) throw new TRPCError({ code: "BAD_REQUEST", message: "Amount paid now cannot exceed the invoice total." });
      const remainingDebt = Math.max(0, total - amountPaid);
      if (input.paymentMethod === "credit" && !resolvedCustomerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Credit checkout requires a customer profile." });
      const newReceiptNumber = receiptNumber(storeId);
      const saleResult = await tx.insert(sales).values({
        storeId,
        cashierUserId: ctx.user.id,
        customerId: resolvedCustomerId,
        shiftId: activeShift?.id ?? null,
        receiptNumber: newReceiptNumber,
        paymentMethod: input.paymentMethod,
        amountPaid: money(amountPaid),
        remainingDebt: money(remainingDebt),
        subtotal: money(subtotal),
        discountTotal: money(discountTotal),
        total: money(total),
      });
      const saleId = Number(saleResult[0].insertId);
      if (resolvedCustomerId && remainingDebt > 0) await tx.update(customers).set({ totalDebt: sql`${customers.totalDebt} + ${money(remainingDebt)}` }).where(eq(customers.id, resolvedCustomerId));
      const newInvoiceNumber = invoiceNumber(saleId);
      await tx.update(sales).set({ invoiceNumber: newInvoiceNumber }).where(eq(sales.id, saleId));

      for (const line of lines) {
        if (line.product) {
          // The stock predicate makes concurrent checkouts fail rather than oversell inventory.
          const result = await tx
            .update(products)
            .set({ quantityOnHand: sql`${products.quantityOnHand} - ${line.quantity}` })
            .where(and(eq(products.id, line.product.id), eq(products.storeId, storeId), gte(products.quantityOnHand, line.quantity)));
          if (Number(result[0].affectedRows) !== 1) {
            throw new TRPCError({ code: "CONFLICT", message: `Inventory changed while checking out ${line.product.name}; please rescan it.` });
          }
        }
        await tx.insert(saleLines).values({
          saleId,
          productId: line.product?.id ?? null,
          storeId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: money(line.unitPrice),
          unitCost: money(line.unitCost),
          unitDiscount: money(line.unitDiscount),
          lineTotal: money(line.lineTotal),
        });
      }

      return {
        saleId,
        receiptNumber: newReceiptNumber,
        invoiceNumber: newInvoiceNumber,
        paymentMethod: input.paymentMethod,
        subtotal: money(subtotal),
        discountTotal: money(discountTotal),
        total: money(total),
        amountPaid: money(amountPaid),
        remainingDebt: money(remainingDebt),
        customerId: resolvedCustomerId,
        customerName: resolvedCustomerName,
        lines: lines.map(line => ({ productName: line.productName, quantity: line.quantity, unitPrice: money(line.unitPrice), unitDiscount: money(line.unitDiscount), lineTotal: money(line.lineTotal) })),
      };
    });
  }),

  findReceipt: roleProcedure("admin", "cashier", "supervisor")
    .input(previewScopeSchema.extend({ receiptNumber: z.string().trim().min(4).max(64) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      requireDatabase(db);
      const receiptMatch = or(eq(sales.receiptNumber, input.receiptNumber), eq(sales.invoiceNumber, input.receiptNumber));
      const storeId = input.previewStoreId
        ? resolvePosStore(ctx.user, input.previewStoreId)
        : undefined;
      const allowedStoreIds = isSuperAdmin(ctx.user) ? [] : assignedStoresForRoles(ctx.user, ["admin", "cashier", "supervisor"]);
      const [sale] = await db.select().from(sales).where(and(receiptMatch, ...(storeId ? [eq(sales.storeId, storeId)] : !isSuperAdmin(ctx.user) ? [inArray(sales.storeId, allowedStoreIds)] : []))).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "No invoice or receipt from this branch matches that number." });
      const saleStoreId = sale.storeId;
      if (!isSuperAdmin(ctx.user)) requireBranchRole(ctx.user, saleStoreId, ["admin", "cashier", "supervisor"]);

      const [lines, priorReturns] = await Promise.all([
        db.select().from(saleLines).where(eq(saleLines.saleId, sale.id)),
        db.select({ saleLineId: returnLines.saleLineId, quantity: returnLines.quantity })
          .from(returnLines)
          .innerJoin(saleReturns, eq(returnLines.returnId, saleReturns.id))
          .where(and(eq(saleReturns.saleId, sale.id), eq(saleReturns.storeId, saleStoreId))),
      ]);
      const returnedByLine = new Map<number, number>();
      priorReturns.forEach(item => returnedByLine.set(item.saleLineId, (returnedByLine.get(item.saleLineId) ?? 0) + item.quantity));

      return {
        sale,
        lines: lines.map(line => ({ id: line.id, productId: line.productId, productName: line.productName, quantity: line.quantity, unitPrice: line.unitPrice, unitDiscount: line.unitDiscount, lineTotal: line.lineTotal, returnableQuantity: line.productId ? line.quantity - (returnedByLine.get(line.id) ?? 0) : 0 })),
      };
    }),

  /** Supervisor-only current-day operational totals for the assigned POS branch. */
  dailyShiftSummary: supervisorProcedure.input(previewScopeSchema).query(async ({ ctx, input }) => {
    const storeId = resolvePosStore(ctx.user, input.previewStoreId);
    const db = await getDb();
    requireDatabase(db);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const todaySales = await db.select({ id: sales.id, total: sales.total }).from(sales).where(and(eq(sales.storeId, storeId), gte(sales.createdAt, start)));
    const saleIds = todaySales.map(sale => sale.id);
    const lines = saleIds.length ? await db.select({ quantity: saleLines.quantity }).from(saleLines).where(inArray(saleLines.saleId, saleIds)) : [];
    return {
      transactionCount: todaySales.length,
      itemsSold: lines.reduce((total, line) => total + line.quantity, 0),
      salesTotal: money(todaySales.reduce((total, sale) => total + Number(sale.total), 0)),
    };
  }),

  processReturn: roleProcedure("admin", "cashier", "supervisor").input(returnInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    requireDatabase(db);

    return db.transaction(async tx => {
      const [sale] = await tx.select().from(sales).where(eq(sales.id, input.saleId)).for("update").limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "The original branch receipt could not be found." });
      const storeId = input.previewStoreId ? resolvePosStore(ctx.user, input.previewStoreId) : sale.storeId;
      if (!isSuperAdmin(ctx.user)) requireBranchRole(ctx.user, storeId, ["admin", "cashier", "supervisor"]);
      if (sale.storeId !== storeId) throw new TRPCError({ code: "NOT_FOUND", message: "The original branch receipt could not be found." });

      const saleLineIds = input.items.map(item => item.saleLineId);
      const originalLines = await tx.select().from(saleLines).where(and(eq(saleLines.saleId, sale.id), inArray(saleLines.id, saleLineIds)));
      if (originalLines.length !== input.items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "All returned items must belong to the original receipt." });

      const priorReturns = await tx.select({ saleLineId: returnLines.saleLineId, quantity: returnLines.quantity })
        .from(returnLines)
        .innerJoin(saleReturns, eq(returnLines.returnId, saleReturns.id))
        .where(and(eq(saleReturns.saleId, sale.id), inArray(returnLines.saleLineId, saleLineIds)));
      const returnedByLine = new Map<number, number>();
      priorReturns.forEach(item => returnedByLine.set(item.saleLineId, (returnedByLine.get(item.saleLineId) ?? 0) + item.quantity));

      const resolvedLines = input.items.map(item => {
        const original = originalLines.find(line => line.id === item.saleLineId);
        if (!original) throw new TRPCError({ code: "BAD_REQUEST", message: "Return line does not match the receipt." });
        if (!original.productId) throw new TRPCError({ code: "BAD_REQUEST", message: "Custom-price receipt lines are not inventory returns." });
        const remaining = original.quantity - (returnedByLine.get(original.id) ?? 0);
        if (item.quantity > remaining) throw new TRPCError({ code: "CONFLICT", message: `${original.productName} has only ${remaining} returnable unit(s) left.` });
        const unitRefund = Number(original.unitPrice) - Number(original.unitDiscount);
        return { original, productId: original.productId, quantity: item.quantity, unitRefund, lineTotal: unitRefund * item.quantity };
      });

      const totalRefund = resolvedLines.reduce((total, line) => total + line.lineTotal, 0);
      const returnResult = await tx.insert(saleReturns).values({
        saleId: sale.id,
        storeId,
        cashierUserId: ctx.user.id,
        reason: input.reason || null,
        totalRefund: money(totalRefund),
      });
      const returnId = Number(returnResult[0].insertId);

      for (const line of resolvedLines) {
        await tx.update(products).set({ quantityOnHand: sql`${products.quantityOnHand} + ${line.quantity}` })
          .where(and(eq(products.id, line.productId), eq(products.storeId, storeId)));
        await tx.insert(returnLines).values({
          returnId,
          saleLineId: line.original.id,
          productId: line.productId,
          quantity: line.quantity,
          unitRefund: money(line.unitRefund),
          lineTotal: money(line.lineTotal),
        });
      }

      if (sale.paymentMethod === "credit" && sale.customerId) {
        const [customer] = await tx.select({ totalDebt: customers.totalDebt }).from(customers).where(eq(customers.id, sale.customerId)).for("update").limit(1);
        const debtReduction = Math.min(totalRefund, Number(sale.remainingDebt), Number(customer?.totalDebt ?? 0));
        await tx.update(sales).set({ remainingDebt: sql`greatest(${sales.remainingDebt} - ${money(totalRefund)}, 0)` }).where(eq(sales.id, sale.id));
        if (debtReduction > 0 && customer) {
          await tx.update(customers).set({ totalDebt: sql`greatest(${customers.totalDebt} - ${money(debtReduction)}, 0)` }).where(eq(customers.id, sale.customerId));
          const [updated] = await tx.select({ totalDebt: customers.totalDebt }).from(customers).where(eq(customers.id, sale.customerId)).limit(1);
          await tx.insert(customerDebtTransactions).values({ customerId: sale.customerId, storeId, transactionType: "return_credit", amount: money(debtReduction), note: input.reason?.trim() || `Credit invoice return #${sale.invoiceNumber ?? sale.id}`, balanceAfter: money(Number(updated?.totalDebt ?? 0)), createdByUserId: ctx.user.id });
        }
      }

      return { returnId, saleId: sale.id, totalRefund: money(totalRefund), returnedLines: resolvedLines.length };
    });
  }),

  /** Accepts returned stock without an original invoice and records an independent auditable return transaction. */
  processDirectReturn: posProcedure.input(directReturnInput).mutation(async ({ ctx, input }) => {
    const storeId = resolvePosStore(ctx.user, input.previewStoreId);
    const db = await getDb();
    requireDatabase(db);

    return db.transaction(async tx => {
      const productIds = input.items.map(item => item.productId);
      const catalog = await tx.select().from(products).where(and(eq(products.storeId, storeId), inArray(products.id, productIds)));
      if (catalog.length !== input.items.length) throw new TRPCError({ code: "NOT_FOUND", message: "One or more direct-return products are unavailable in this branch." });

      const lines = input.items.map(item => {
        const product = catalog.find(candidate => candidate.id === item.productId);
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "A direct-return product is unavailable." });
        const unitRefund = Number(product.retailPrice);
        return { product, quantity: item.quantity, unitRefund, lineTotal: unitRefund * item.quantity };
      });
      const totalRefund = lines.reduce((total, line) => total + line.lineTotal, 0);
      const returnNumber = directReturnNumber(storeId);
      const created = await tx.insert(directReturns).values({ storeId, cashierUserId: ctx.user.id, returnNumber, reason: input.reason || null, totalRefund: money(totalRefund) });
      const directReturnId = Number(created[0].insertId);

      for (const line of lines) {
        await tx.update(products).set({ quantityOnHand: sql`${products.quantityOnHand} + ${line.quantity}` }).where(and(eq(products.id, line.product.id), eq(products.storeId, storeId)));
        await tx.insert(directReturnLines).values({ directReturnId, productId: line.product.id, productName: line.product.name, quantity: line.quantity, unitRefund: money(line.unitRefund), lineTotal: money(line.lineTotal) });
      }

      return { directReturnId, returnNumber, totalRefund: money(totalRefund), returnedLines: lines.length };
    });
  }),
});
