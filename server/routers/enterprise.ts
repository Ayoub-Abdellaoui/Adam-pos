import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { barcodes, cashOuts, customerDebtTransactions, customers, operationalExpenses, products, returnLines, saleLines, saleReturns, sales, shifts, stockTransferLines, stockTransfers, stores, userBranchRoles, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { adminProcedure, assignedStoresForRoles, isSuperAdmin, posProcedure, protectedProcedure, requireBranchRole, roleProcedure, router, supervisorProcedure, type BranchStaffRole } from "../_core/trpc";
import { calculateGlobalStatistics } from "../analytics";

const storeTypeSchema = z.enum(["cosmetics", "bookstore", "clothing", "gifts", "other"]);
const branchInput = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,24}$/), type: storeTypeSchema });
const optionalStoreInput = z.object({ storeId: z.number().int().positive().optional() });
const globalStatisticsInput = z.object({ from: z.coerce.date(), to: z.coerce.date() }).refine(input => input.from <= input.to, { message: "Start date must be before end date.", path: ["to"] });
const customerDebtTransactionInput = z.object({ customerId: z.number().int().positive(), storeId: z.number().int().positive().optional(), transactionType: z.enum(["payment", "manual_debt"]), amount: z.number().finite().positive().max(9_999_999), note: z.string().trim().max(1_000).optional() });
const creditInvoiceInput = z.object({ saleId: z.number().int().positive(), storeId: z.number().int().positive().optional() });
const creditInvoiceReturnInput = creditInvoiceInput.extend({ reason: z.string().trim().max(500).optional(), items: z.array(z.object({ saleLineId: z.number().int().positive(), quantity: z.number().int().positive().max(1000) })).min(1).max(100) }).superRefine((value, ctx) => { const ids = value.items.map(item => item.saleLineId); if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Each invoice line may be returned only once per request." }); });
const money = (value: number) => Math.max(0, value).toFixed(2);

function scopedStoreId(user: Parameters<typeof requireBranchRole>[0], requestedStoreId: number | undefined, roles: BranchStaffRole[]) {
  if (isSuperAdmin(user)) {
    if (!requestedStoreId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select a branch to perform this operation." });
    return requestedStoreId;
  }
  const permittedStores = assignedStoresForRoles(user, roles);
  const storeId = requestedStoreId ?? (permittedStores.length === 1 ? permittedStores[0] : undefined);
  if (!storeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select a branch to perform this operation." });
  requireBranchRole(user, storeId, roles);
  return storeId;
}

async function requireActiveStore(db: any, storeId: number) {
  const [store] = await db.select().from(stores).where(and(eq(stores.id, storeId), eq(stores.isActive, true))).limit(1);
  if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "The selected active branch could not be found." });
  return store;
}

function requireDb<T>(db: T): asserts db is Exclude<T, null> {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database service is unavailable." });
}

export const enterpriseRouter = router({
  globalStatistics: adminProcedure.input(globalStatisticsInput).query(async ({ input }) => {
    const db = await getDb(); requireDb(db);
    const activeStores = await db.select({ id: stores.id, name: stores.name, type: stores.type }).from(stores).where(eq(stores.isActive, true)).orderBy(asc(stores.name));
    if (!activeStores.length) return calculateGlobalStatistics({ stores: [], sales: [], saleLines: [], returnLines: [], expenses: [] });
    const storeIds = activeStores.map(store => store.id);
    const saleWindow = and(inArray(sales.storeId, storeIds), gte(sales.createdAt, input.from), lte(sales.createdAt, input.to));
    const returnWindow = and(inArray(saleReturns.storeId, storeIds), gte(saleReturns.createdAt, input.from), lte(saleReturns.createdAt, input.to));
    const expenseWindow = and(inArray(operationalExpenses.storeId, storeIds), eq(operationalExpenses.status, "posted"), gte(operationalExpenses.occurredAt, input.from), lte(operationalExpenses.occurredAt, input.to));
    const [saleRows, saleLineRows, returnRows, expenseRows] = await Promise.all([
      db.select({ storeId: sales.storeId, total: sales.total }).from(sales).where(saleWindow),
      db.select({ storeId: saleLines.storeId, storeName: stores.name, productId: saleLines.productId, productName: saleLines.productName, quantity: saleLines.quantity, unitPrice: saleLines.unitPrice, unitCost: saleLines.unitCost, unitDiscount: saleLines.unitDiscount })
        .from(saleLines).innerJoin(sales, eq(saleLines.saleId, sales.id)).innerJoin(stores, eq(saleLines.storeId, stores.id)).where(saleWindow),
      db.select({ storeId: saleReturns.storeId, storeName: stores.name, productId: returnLines.productId, productName: saleLines.productName, quantity: returnLines.quantity, unitRefund: returnLines.unitRefund, unitCost: saleLines.unitCost })
        .from(returnLines).innerJoin(saleReturns, eq(returnLines.returnId, saleReturns.id)).innerJoin(saleLines, eq(returnLines.saleLineId, saleLines.id)).innerJoin(stores, eq(saleReturns.storeId, stores.id)).where(returnWindow),
      db.select({ storeId: operationalExpenses.storeId, amount: operationalExpenses.amount }).from(operationalExpenses).where(expenseWindow),
    ]);
    return calculateGlobalStatistics({ stores: activeStores, sales: saleRows, saleLines: saleLineRows, returnLines: returnRows, expenses: expenseRows });
  }),

  branchStatistics: protectedProcedure.input(globalStatisticsInput.safeExtend({ storeId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await getDb(); requireDb(db);
    const storeId = scopedStoreId(ctx.user, input.storeId, ["admin", "supervisor"]);
    const store = await requireActiveStore(db, storeId);
    const saleWindow = and(eq(sales.storeId, storeId), gte(sales.createdAt, input.from), lte(sales.createdAt, input.to));
    const returnWindow = and(eq(saleReturns.storeId, storeId), gte(saleReturns.createdAt, input.from), lte(saleReturns.createdAt, input.to));
    const expenseWindow = and(eq(operationalExpenses.storeId, storeId), eq(operationalExpenses.status, "posted"), gte(operationalExpenses.occurredAt, input.from), lte(operationalExpenses.occurredAt, input.to));
    const [saleRows, saleLineRows, returnRows, expenseRows] = await Promise.all([
      db.select({ storeId: sales.storeId, total: sales.total }).from(sales).where(saleWindow),
      db.select({ storeId: saleLines.storeId, storeName: stores.name, productId: saleLines.productId, productName: saleLines.productName, quantity: saleLines.quantity, unitPrice: saleLines.unitPrice, unitCost: saleLines.unitCost, unitDiscount: saleLines.unitDiscount }).from(saleLines).innerJoin(sales, eq(saleLines.saleId, sales.id)).innerJoin(stores, eq(saleLines.storeId, stores.id)).where(saleWindow),
      db.select({ storeId: saleReturns.storeId, storeName: stores.name, productId: returnLines.productId, productName: saleLines.productName, quantity: returnLines.quantity, unitRefund: returnLines.unitRefund, unitCost: saleLines.unitCost }).from(returnLines).innerJoin(saleReturns, eq(returnLines.returnId, saleReturns.id)).innerJoin(saleLines, eq(returnLines.saleLineId, saleLines.id)).innerJoin(stores, eq(saleReturns.storeId, stores.id)).where(returnWindow),
      db.select({ storeId: operationalExpenses.storeId, amount: operationalExpenses.amount }).from(operationalExpenses).where(expenseWindow),
    ]);
    return calculateGlobalStatistics({ stores: [{ id: store.id, name: store.name, type: store.type }], sales: saleRows, saleLines: saleLineRows, returnLines: returnRows, expenses: expenseRows });
  }),

  branches: router({
    list: adminProcedure.query(async () => {
      const db = await getDb(); requireDb(db);
      const rows = await db.select({ id: stores.id, name: stores.name, code: stores.code, type: stores.type, isActive: stores.isActive, createdAt: stores.createdAt })
        .from(stores).orderBy(asc(stores.name));
      const counts = await db.select({ storeId: products.storeId, productCount: sql<number>`count(*)` }).from(products).groupBy(products.storeId);
      const countByStore = new Map(counts.map(row => [row.storeId, Number(row.productCount)]));
      return rows.map(row => ({ ...row, productCount: countByStore.get(row.id) ?? 0 }));
    }),
    active: roleProcedure("admin", "cashier", "stock_manager", "supervisor").query(async ({ ctx }) => {
      const db = await getDb(); requireDb(db);
      const assignedStoreIds = ctx.user.branchRoles.map(assignment => assignment.storeId);
      const scope = isSuperAdmin(ctx.user) ? eq(stores.isActive, true) : and(eq(stores.isActive, true), assignedStoreIds.length ? inArray(stores.id, assignedStoreIds) : sql`false`);
      return db.select({ id: stores.id, name: stores.name, code: stores.code, type: stores.type }).from(stores).where(scope).orderBy(asc(stores.name));
    }),
    create: adminProcedure.input(branchInput).mutation(async ({ input }) => {
      const db = await getDb(); requireDb(db);
      const [existing] = await db.select({ id: stores.id }).from(stores).where(or(eq(stores.name, input.name), eq(stores.code, input.code))).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "A branch with this name or code already exists." });
      let result;
      try {
        result = await db.insert(stores).values({ ...input, isActive: true });
      } catch (error: any) {
        if (error?.code === "ER_DUP_ENTRY" || error?.errno === 1062) throw new TRPCError({ code: "CONFLICT", message: "A branch with this name or code already exists." });
        throw error;
      }
      return { storeId: Number(result[0].insertId) };
    }),
    update: adminProcedure.input(branchInput.extend({ storeId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb(); requireDb(db);
      const [current] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, input.storeId)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "The requested branch does not exist." });
      const [collision] = await db.select({ id: stores.id }).from(stores).where(and(or(eq(stores.name, input.name), eq(stores.code, input.code)), sql`${stores.id} != ${input.storeId}`)).limit(1);
      if (collision) throw new TRPCError({ code: "CONFLICT", message: "Another branch already uses that name or code." });
      await db.update(stores).set({ name: input.name, code: input.code, type: input.type, isActive: input.isActive }).where(eq(stores.id, input.storeId));
      return { storeId: input.storeId };
    }),
    remove: adminProcedure.input(z.object({ storeId: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); requireDb(db);
      const [usage] = await db.select({ products: sql<number>`(select count(*) from products where storeId = ${input.storeId})`, staff: sql<number>`(select count(*) from user_branch_roles where storeId = ${input.storeId})`, sales: sql<number>`(select count(*) from sales where storeId = ${input.storeId})` }).from(stores).where(eq(stores.id, input.storeId)).limit(1);
      if (!usage) throw new TRPCError({ code: "NOT_FOUND", message: "The requested branch does not exist." });
      if (Number(usage.products) || Number(usage.staff) || Number(usage.sales)) throw new TRPCError({ code: "CONFLICT", message: "A branch with staff, inventory, or sales is preserved for audit history. Mark it inactive instead." });
      await db.delete(stores).where(eq(stores.id, input.storeId));
      return { deleted: true };
    }),
  }),

  customers: router({
    search: roleProcedure("admin", "cashier", "supervisor").input(z.object({ query: z.string().trim().max(120).default(""), limit: z.number().int().min(1).max(30).default(15) })).query(async ({ input }) => {
      const db = await getDb(); requireDb(db);
      const query = input.query.trim();
      const scope = query ? or(like(customers.name, `%${query}%`), like(customers.firstName, `%${query}%`), like(customers.lastName, `%${query}%`), like(customers.phone, `%${query}%`), like(customers.loyaltyNumber, `%${query}%`)) : undefined;
      return db.select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, name: customers.name, phone: customers.phone, email: customers.email, loyaltyNumber: customers.loyaltyNumber, totalDebt: customers.totalDebt, createdAt: customers.createdAt }).from(customers).where(scope).orderBy(asc(customers.name)).limit(input.limit);
    }),
    createProfile: roleProcedure("admin", "cashier", "supervisor").input(z.object({ firstName: z.string().trim().min(1).max(120), lastName: z.string().trim().min(1).max(120), phone: z.string().trim().min(4).max(64) })).mutation(async ({ input }) => {
      const db = await getDb(); requireDb(db);
      const [existing] = await db.select({ id: customers.id }).from(customers).where(eq(customers.phone, input.phone)).limit(1);
      if (existing) return { customerId: existing.id, created: false };
      const result = await db.insert(customers).values({ firstName: input.firstName, lastName: input.lastName, name: `${input.firstName} ${input.lastName}`.trim(), phone: input.phone });
      return { customerId: Number(result[0].insertId), created: true };
    }),
    upsert: roleProcedure("admin", "cashier", "supervisor").input(z.object({ name: z.string().trim().min(2).max(255), phone: z.string().trim().min(4).max(64), email: z.string().trim().email().max(320).optional(), loyaltyNumber: z.string().trim().min(3).max(64).optional() })).mutation(async ({ input }) => {
      const db = await getDb(); requireDb(db);
      const [existing] = await db.select({ id: customers.id }).from(customers).where(eq(customers.phone, input.phone)).limit(1);
      const [firstName, ...rest] = input.name.split(/\s+/);
      const lastName = rest.join(" ") || firstName;
      if (existing) { await db.update(customers).set({ firstName, lastName, name: input.name, email: input.email ?? null, loyaltyNumber: input.loyaltyNumber ?? null }).where(eq(customers.id, existing.id)); return { customerId: existing.id, created: false }; }
      const result = await db.insert(customers).values({ firstName, lastName, name: input.name, phone: input.phone, email: input.email ?? null, loyaltyNumber: input.loyaltyNumber ?? null });
      return { customerId: Number(result[0].insertId), created: true };
    }),
    profile: roleProcedure("admin", "cashier", "supervisor").input(z.object({ customerId: z.number().int().positive(), storeId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = isSuperAdmin(ctx.user) ? input.storeId : scopedStoreId(ctx.user, input.storeId, ["admin", "cashier", "supervisor"]);
      const [customer] = await db.select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, name: customers.name, phone: customers.phone, totalDebt: customers.totalDebt }).from(customers).where(eq(customers.id, input.customerId)).limit(1);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer profile not found." });
      const conditions = [eq(sales.customerId, input.customerId), eq(sales.paymentMethod, "credit"), ...(storeId ? [eq(sales.storeId, storeId)] : [])];
      const invoices = await db.select({ id: sales.id, invoiceNumber: sales.invoiceNumber, storeId: sales.storeId, total: sales.total, amountPaid: sales.amountPaid, remainingDebt: sales.remainingDebt, createdAt: sales.createdAt }).from(sales).where(and(...conditions)).orderBy(desc(sales.createdAt)).limit(250);
      const transactionConditions = [eq(customerDebtTransactions.customerId, input.customerId), ...(storeId ? [eq(customerDebtTransactions.storeId, storeId)] : [])];
      const transactions = await db.select({ id: customerDebtTransactions.id, storeId: customerDebtTransactions.storeId, transactionType: customerDebtTransactions.transactionType, amount: customerDebtTransactions.amount, note: customerDebtTransactions.note, balanceAfter: customerDebtTransactions.balanceAfter, createdAt: customerDebtTransactions.createdAt, recordedBy: users.name }).from(customerDebtTransactions).leftJoin(users, eq(customerDebtTransactions.createdByUserId, users.id)).where(and(...transactionConditions)).orderBy(desc(customerDebtTransactions.createdAt)).limit(250);
      return { customer, invoices, transactions };
    }),
    creditInvoiceDetail: roleProcedure("admin", "cashier", "supervisor").input(creditInvoiceInput).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const [sale] = await db.select().from(sales).where(and(eq(sales.id, input.saleId), eq(sales.paymentMethod, "credit"))).limit(1);
      if (!sale || !sale.customerId) throw new TRPCError({ code: "NOT_FOUND", message: "The requested credit invoice could not be found." });
      const storeId = isSuperAdmin(ctx.user) ? (input.storeId ?? sale.storeId) : scopedStoreId(ctx.user, input.storeId ?? sale.storeId, ["admin", "cashier", "supervisor"]);
      if (sale.storeId !== storeId) throw new TRPCError({ code: "FORBIDDEN", message: "This credit invoice belongs to a different branch." });
      const [lines, priorReturns] = await Promise.all([
        db.select().from(saleLines).where(eq(saleLines.saleId, sale.id)),
        db.select({ saleLineId: returnLines.saleLineId, quantity: returnLines.quantity }).from(returnLines).innerJoin(saleReturns, eq(returnLines.returnId, saleReturns.id)).where(and(eq(saleReturns.saleId, sale.id), eq(saleReturns.storeId, storeId))),
      ]);
      const returnedByLine = new Map<number, number>();
      priorReturns.forEach(item => returnedByLine.set(item.saleLineId, (returnedByLine.get(item.saleLineId) ?? 0) + item.quantity));
      return { sale, lines: lines.map(line => ({ id: line.id, productId: line.productId, productName: line.productName, quantity: line.quantity, unitPrice: line.unitPrice, unitDiscount: line.unitDiscount, lineTotal: line.lineTotal, returnedQuantity: returnedByLine.get(line.id) ?? 0, returnableQuantity: line.productId ? line.quantity - (returnedByLine.get(line.id) ?? 0) : 0 })) };
    }),
    processCreditInvoiceReturn: roleProcedure("admin", "supervisor").input(creditInvoiceReturnInput).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const [existingSale] = await db.select().from(sales).where(and(eq(sales.id, input.saleId), eq(sales.paymentMethod, "credit"))).limit(1);
      if (!existingSale || !existingSale.customerId) throw new TRPCError({ code: "NOT_FOUND", message: "The requested credit invoice could not be found." });
      const storeId = isSuperAdmin(ctx.user) ? (input.storeId ?? existingSale.storeId) : scopedStoreId(ctx.user, input.storeId ?? existingSale.storeId, ["admin", "supervisor"]);
      if (existingSale.storeId !== storeId) throw new TRPCError({ code: "FORBIDDEN", message: "This credit invoice belongs to a different branch." });
      return db.transaction(async tx => {
        const [sale] = await tx.select().from(sales).where(and(eq(sales.id, input.saleId), eq(sales.storeId, storeId), eq(sales.paymentMethod, "credit"))).for("update").limit(1);
        if (!sale || !sale.customerId) throw new TRPCError({ code: "NOT_FOUND", message: "The requested credit invoice could not be found." });
        const saleLineIds = input.items.map(item => item.saleLineId);
        const originalLines = await tx.select().from(saleLines).where(and(eq(saleLines.saleId, sale.id), inArray(saleLines.id, saleLineIds)));
        if (originalLines.length !== input.items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "All returned items must belong to the original credit invoice." });
        const priorReturns = await tx.select({ saleLineId: returnLines.saleLineId, quantity: returnLines.quantity }).from(returnLines).innerJoin(saleReturns, eq(returnLines.returnId, saleReturns.id)).where(and(eq(saleReturns.saleId, sale.id), inArray(returnLines.saleLineId, saleLineIds)));
        const returnedByLine = new Map<number, number>(); priorReturns.forEach(item => returnedByLine.set(item.saleLineId, (returnedByLine.get(item.saleLineId) ?? 0) + item.quantity));
        const resolvedLines = input.items.map(item => { const original = originalLines.find(line => line.id === item.saleLineId); if (!original || !original.productId) throw new TRPCError({ code: "BAD_REQUEST", message: "Only original inventory products can be returned." }); const remaining = original.quantity - (returnedByLine.get(original.id) ?? 0); if (item.quantity > remaining) throw new TRPCError({ code: "CONFLICT", message: `${original.productName} has only ${remaining} returnable unit(s) left.` }); const unitRefund = Number(original.unitPrice) - Number(original.unitDiscount); return { original, productId: original.productId, quantity: item.quantity, unitRefund, lineTotal: unitRefund * item.quantity }; });
        const totalRefund = resolvedLines.reduce((total, line) => total + line.lineTotal, 0);
        const returnResult = await tx.insert(saleReturns).values({ saleId: sale.id, storeId, cashierUserId: ctx.user.id, reason: input.reason || null, totalRefund: money(totalRefund) });
        const returnId = Number(returnResult[0].insertId);
        for (const line of resolvedLines) { await tx.update(products).set({ quantityOnHand: sql`${products.quantityOnHand} + ${line.quantity}` }).where(and(eq(products.id, line.productId), eq(products.storeId, storeId))); await tx.insert(returnLines).values({ returnId, saleLineId: line.original.id, productId: line.productId, quantity: line.quantity, unitRefund: money(line.unitRefund), lineTotal: money(line.lineTotal) }); }
        const [customer] = await tx.select({ totalDebt: customers.totalDebt }).from(customers).where(eq(customers.id, sale.customerId)).for("update").limit(1);
        const debtReduction = Math.min(totalRefund, Number(sale.remainingDebt), Number(customer?.totalDebt ?? 0));
        await tx.update(sales).set({ remainingDebt: sql`greatest(${sales.remainingDebt} - ${money(totalRefund)}, 0)` }).where(eq(sales.id, sale.id));
        if (debtReduction > 0 && customer) { await tx.update(customers).set({ totalDebt: sql`greatest(${customers.totalDebt} - ${money(debtReduction)}, 0)` }).where(eq(customers.id, sale.customerId)); const [updated] = await tx.select({ totalDebt: customers.totalDebt }).from(customers).where(eq(customers.id, sale.customerId)).limit(1); await tx.insert(customerDebtTransactions).values({ customerId: sale.customerId, storeId, transactionType: "return_credit", amount: money(debtReduction), note: input.reason?.trim() || `Credit invoice return #${sale.invoiceNumber ?? sale.id}`, balanceAfter: money(Number(updated?.totalDebt ?? 0)), createdByUserId: ctx.user.id }); }
        return { returnId, saleId: sale.id, totalRefund: money(totalRefund), debtReduction: money(debtReduction), returnedLines: resolvedLines.length };
      });
    }),
    recordDebtTransaction: roleProcedure("admin", "cashier", "supervisor").input(customerDebtTransactionInput).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = isSuperAdmin(ctx.user) ? input.storeId : scopedStoreId(ctx.user, input.storeId, ["admin", "cashier", "supervisor"]);
      if (storeId) await requireActiveStore(db, storeId);
      const amount = money(input.amount);
      return db.transaction(async tx => {
        const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId)).limit(1);
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer profile not found." });
        const updateScope = input.transactionType === "payment" ? and(eq(customers.id, input.customerId), gte(customers.totalDebt, amount)) : eq(customers.id, input.customerId);
        const update = input.transactionType === "payment"
          ? await tx.update(customers).set({ totalDebt: sql`${customers.totalDebt} - ${amount}` }).where(updateScope)
          : await tx.update(customers).set({ totalDebt: sql`${customers.totalDebt} + ${amount}` }).where(updateScope);
        if (input.transactionType === "payment" && !Number(update[0].affectedRows)) throw new TRPCError({ code: "CONFLICT", message: "Payment exceeds the customer's current debt." });
        const [updatedCustomer] = await tx.select({ totalDebt: customers.totalDebt }).from(customers).where(eq(customers.id, input.customerId)).limit(1);
        const balanceAfter = money(Number(updatedCustomer?.totalDebt ?? 0));
        const result = await tx.insert(customerDebtTransactions).values({ customerId: input.customerId, storeId: storeId ?? null, transactionType: input.transactionType, amount, note: input.note?.trim() || null, balanceAfter, createdByUserId: ctx.user.id });
        return { transactionId: Number(result[0].insertId), totalDebt: Number(balanceAfter), transactionType: input.transactionType };
      });
    }),
    history: roleProcedure("admin", "cashier", "supervisor").input(z.object({ customerId: z.number().int().positive(), storeId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = isSuperAdmin(ctx.user) ? input.storeId : scopedStoreId(ctx.user, input.storeId, ["admin", "cashier", "supervisor"]);
      const conditions = [eq(sales.customerId, input.customerId), ...(storeId ? [eq(sales.storeId, storeId)] : [])];
      return db.select({ id: sales.id, storeId: sales.storeId, receiptNumber: sales.receiptNumber, invoiceNumber: sales.invoiceNumber, total: sales.total, createdAt: sales.createdAt }).from(sales).where(and(...conditions)).orderBy(desc(sales.createdAt)).limit(50);
    }),
  }),

  shifts: router({
    active: posProcedure.input(optionalStoreInput).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = scopedStoreId(ctx.user, input.storeId, ["admin", "cashier", "supervisor"]);
      const activeRole = isSuperAdmin(ctx.user) ? "super_admin" : ctx.user.branchRoles.find(assignment => assignment.storeId === storeId)?.role;
      const scope = activeRole === "cashier" ? and(eq(shifts.storeId, storeId), eq(shifts.cashierUserId, ctx.user.id), eq(shifts.status, "open")) : and(eq(shifts.storeId, storeId), eq(shifts.status, "open"));
      return db.select().from(shifts).where(scope).orderBy(desc(shifts.openedAt));
    }),
    cashiers: supervisorProcedure.input(optionalStoreInput).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = scopedStoreId(ctx.user, input.storeId, ["admin", "supervisor"]);
      return db.select({ id: users.id, name: users.name, email: users.email }).from(users).innerJoin(userBranchRoles, eq(userBranchRoles.userId, users.id)).where(and(eq(userBranchRoles.storeId, storeId), eq(userBranchRoles.role, "cashier"))).orderBy(asc(users.name));
    }),
    open: supervisorProcedure.input(z.object({ storeId: z.number().int().positive().optional(), cashierUserId: z.number().int().positive(), openingCash: z.number().finite().nonnegative().max(9_999_999.99).default(0), notes: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = scopedStoreId(ctx.user, input.storeId, ["admin", "supervisor"]);
      await requireActiveStore(db, storeId);
      const [cashier] = await db.select({ id: users.id }).from(users).innerJoin(userBranchRoles, eq(userBranchRoles.userId, users.id)).where(and(eq(users.id, input.cashierUserId), eq(userBranchRoles.storeId, storeId), eq(userBranchRoles.role, "cashier"))).limit(1);
      if (!cashier) throw new TRPCError({ code: "FORBIDDEN", message: "A shift can only be opened for a cashier assigned to this branch." });
      const [openShift] = await db.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.storeId, storeId), eq(shifts.cashierUserId, input.cashierUserId), eq(shifts.status, "open"))).limit(1);
      if (openShift) throw new TRPCError({ code: "CONFLICT", message: "This cashier already has an open shift." });
      const result = await db.insert(shifts).values({ storeId, cashierUserId: input.cashierUserId, openedByUserId: ctx.user.id, openingCash: money(input.openingCash), expectedCash: money(input.openingCash), notes: input.notes || null });
      return { shiftId: Number(result[0].insertId) };
    }),
    close: supervisorProcedure.input(z.object({ shiftId: z.number().int().positive(), declaredCash: z.number().finite().nonnegative().max(9_999_999.99), notes: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const [shift] = await db.select().from(shifts).where(and(eq(shifts.id, input.shiftId), eq(shifts.status, "open"))).limit(1);
      if (!shift) throw new TRPCError({ code: "NOT_FOUND", message: "The requested open shift could not be found." });
      scopedStoreId(ctx.user, shift.storeId, ["admin", "supervisor"]);
      const cashSales = await db.select({ total: sales.total }).from(sales).where(and(eq(sales.shiftId, shift.id), eq(sales.paymentMethod, "cash")));
      const withdrawals = await db.select({ amount: cashOuts.amount }).from(cashOuts).where(eq(cashOuts.shiftId, shift.id));
      const expectedCash = Number(shift.openingCash) + cashSales.reduce((total, sale) => total + Number(sale.total), 0) - withdrawals.reduce((total, withdrawal) => total + Number(withdrawal.amount), 0);
      const variance = input.declaredCash - expectedCash;
      await db.update(shifts).set({ status: "closed", closedAt: new Date(), closedByUserId: ctx.user.id, expectedCash: money(expectedCash), declaredCash: money(input.declaredCash), variance: variance.toFixed(2), notes: input.notes || shift.notes }).where(eq(shifts.id, shift.id));
      return { shiftId: shift.id, expectedCash: money(expectedCash), declaredCash: money(input.declaredCash), variance: variance.toFixed(2) };
    }),
    summary: supervisorProcedure.input(optionalStoreInput).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = scopedStoreId(ctx.user, input.storeId, ["admin", "supervisor"]);
      const rows = await db.select({ id: shifts.id, cashierName: users.name, openingCash: shifts.openingCash, expectedCash: shifts.expectedCash, declaredCash: shifts.declaredCash, variance: shifts.variance, status: shifts.status, openedAt: shifts.openedAt, closedAt: shifts.closedAt }).from(shifts).innerJoin(users, eq(shifts.cashierUserId, users.id)).where(eq(shifts.storeId, storeId)).orderBy(desc(shifts.openedAt)).limit(30);
      return rows;
    }),
  }),

  transfers: router({
    catalog: supervisorProcedure.input(optionalStoreInput).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const sourceStoreId = scopedStoreId(ctx.user, input.storeId, ["admin", "supervisor"]);
      const [sourceStore, targetStores, sourceProducts] = await Promise.all([
        requireActiveStore(db, sourceStoreId),
        db.select({ id: stores.id, name: stores.name, code: stores.code }).from(stores).where(and(eq(stores.isActive, true), sql`${stores.id} != ${sourceStoreId}`)).orderBy(asc(stores.name)),
        db.select({ id: products.id, name: products.name, quantityOnHand: products.quantityOnHand, retailPrice: products.retailPrice, lastCostPrice: products.lastCostPrice }).from(products).where(and(eq(products.storeId, sourceStoreId), gte(products.quantityOnHand, 1))).orderBy(asc(products.name)),
      ]);
      return { sourceStore, targetStores, products: sourceProducts };
    }),
    execute: supervisorProcedure.input(z.object({ sourceStoreId: z.number().int().positive().optional(), targetStoreId: z.number().int().positive(), notes: z.string().trim().max(500).optional(), lines: z.array(z.object({ sourceProductId: z.number().int().positive(), quantity: z.number().int().positive().max(1_000_000) })).min(1).max(100) })).mutation(async ({ ctx, input }) => {
      const sourceStoreId = scopedStoreId(ctx.user, input.sourceStoreId, ["admin", "supervisor"]);
      if (sourceStoreId === input.targetStoreId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a different destination branch." });
      if (new Set(input.lines.map(line => line.sourceProductId)).size !== input.lines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "A product can only appear once in a transfer." });
      const db = await getDb(); requireDb(db);
      return db.transaction(async tx => {
        await Promise.all([requireActiveStore(tx, sourceStoreId), requireActiveStore(tx, input.targetStoreId)]);
        const sourceProductIds = input.lines.map(line => line.sourceProductId);
        const sourceProducts = await tx.select().from(products).where(and(eq(products.storeId, sourceStoreId), inArray(products.id, sourceProductIds)));
        if (sourceProducts.length !== input.lines.length) throw new TRPCError({ code: "NOT_FOUND", message: "One or more source products are unavailable in your branch." });
        const result = await tx.insert(stockTransfers).values({ sourceStoreId, targetStoreId: input.targetStoreId, requestedByUserId: ctx.user.id, notes: input.notes || null });
        const transferId = Number(result[0].insertId);
        for (const line of input.lines) {
          const source = sourceProducts.find(product => product.id === line.sourceProductId);
          if (!source || source.quantityOnHand < line.quantity) throw new TRPCError({ code: "CONFLICT", message: `Insufficient source stock for ${source?.name ?? "a product"}.` });
          const decrement = await tx.update(products).set({ quantityOnHand: sql`${products.quantityOnHand} - ${line.quantity}` }).where(and(eq(products.id, source.id), eq(products.storeId, sourceStoreId), gte(products.quantityOnHand, line.quantity)));
          if (Number(decrement[0].affectedRows) !== 1) throw new TRPCError({ code: "CONFLICT", message: `Source stock changed while transferring ${source.name}.` });
          let [target] = await tx.select().from(products).where(and(eq(products.storeId, input.targetStoreId), eq(products.name, source.name))).limit(1);
          if (target) {
            await tx.update(products).set({ quantityOnHand: sql`${products.quantityOnHand} + ${line.quantity}`, lastCostPrice: source.lastCostPrice, retailPrice: source.retailPrice }).where(eq(products.id, target.id));
          } else {
            const created = await tx.insert(products).values({ storeId: input.targetStoreId, createdByUserId: ctx.user.id, name: source.name, sku: source.sku, description: source.description, quantityOnHand: line.quantity, lastCostPrice: source.lastCostPrice, retailPrice: source.retailPrice });
            const targetProductId = Number(created[0].insertId);
            [target] = await tx.select().from(products).where(eq(products.id, targetProductId)).limit(1);
            const sourceBarcodes = await tx.select({ value: barcodes.value }).from(barcodes).where(eq(barcodes.productId, source.id));
            if (sourceBarcodes.length) await tx.insert(barcodes).values(sourceBarcodes.map(barcode => ({ productId: targetProductId, value: barcode.value })));
          }
          if (!target) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The destination product could not be created." });
          await tx.insert(stockTransferLines).values({ transferId, sourceProductId: source.id, targetProductId: target.id, productName: source.name, quantity: line.quantity, unitCost: source.lastCostPrice });
        }
        return { transferId, transferredLines: input.lines.length };
      });
    }),
    history: supervisorProcedure.input(optionalStoreInput).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = scopedStoreId(ctx.user, input.storeId, ["admin", "supervisor"]);
      return db.select({ id: stockTransfers.id, sourceStoreId: stockTransfers.sourceStoreId, targetStoreId: stockTransfers.targetStoreId, status: stockTransfers.status, notes: stockTransfers.notes, createdAt: stockTransfers.createdAt, requestedBy: users.name }).from(stockTransfers).leftJoin(users, eq(stockTransfers.requestedByUserId, users.id)).where(or(eq(stockTransfers.sourceStoreId, storeId), eq(stockTransfers.targetStoreId, storeId))).orderBy(desc(stockTransfers.createdAt)).limit(50);
    }),
  }),
});
