import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { invoiceExceptionDecisions, invoices, operationalExpenses, products, saleLines, stockEntries, stores, supplierInvoiceLines, supplierInvoicePayments, supplierPaymentAllocations, supplierPayments, suppliers, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { assignedStoresForRoles, isSuperAdmin, requireBranchRole, roleProcedure, router, type BranchStaffRole } from "../_core/trpc";

const financialRoles: BranchStaffRole[] = ["admin", "supervisor"];
const financialProcedure = roleProcedure(...financialRoles);
const paymentMethodSchema = z.enum(["cash", "card", "bank_transfer", "mobile", "other"]);
type FinancePaymentMethod = z.infer<typeof paymentMethodSchema>;
type FinanceInvoice = { id: number; storeId: number; supplierId: number; totalCost: string; totalAmount: string; amountPaid: string; remainingDebt: string; supplierReference: string | null; dueDate: Date | null; accountingNotes: string | null; createdAt: Date; supplierName: string; storeName: string };
type InvoicePaymentRow = { id: number; amount: string; paymentMethod: FinancePaymentMethod; reference: string | null; notes: string | null; paidAt: Date; recordedBy: string | null };
type InvoiceLineRow = { id: number; productName: string; quantity: number; unitCost: string };
const dateRangeSchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).refine(input => !input.from || !input.to || input.from <= input.to, { message: "The start date must be before the end date.", path: ["to"] });
const optionalScopeSchema = dateRangeSchema.safeExtend({ storeId: z.number().int().positive().optional() });
const supplierDetailsSchema = z.object({
  name: z.string().trim().min(2).max(255),
  contactName: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(64).optional(),
  email: z.string().trim().email().max(320).optional(),
});

function requireDb<T>(db: T): asserts db is Exclude<T, null> {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database service is unavailable." });
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateConditions<T extends { from?: Date; to?: Date }>(column: any, input: T) {
  return [...(input.from ? [gte(column, input.from)] : []), ...(input.to ? [lte(column, input.to)] : [])];
}

/** Resolves a requested branch before financial data is read or written. */
function resolveFinanceStore(user: Parameters<typeof requireBranchRole>[0], requestedStoreId?: number) {
  if (isSuperAdmin(user)) return requestedStoreId;
  const assignedStores = assignedStoresForRoles(user, financialRoles);
  const storeId = requestedStoreId ?? (assignedStores.length === 1 ? assignedStores[0] : undefined);
  if (!storeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an authorized branch before opening financial records." });
  requireBranchRole(user, storeId, financialRoles);
  return storeId;
}

function requireFinanceStore(user: Parameters<typeof requireBranchRole>[0], requestedStoreId?: number) {
  const storeId = resolveFinanceStore(user, requestedStoreId);
  if (!storeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select a branch before recording a financial transaction." });
  return storeId;
}

async function invoiceWithAccess(db: any, user: Parameters<typeof requireBranchRole>[0], invoiceId: number): Promise<FinanceInvoice> {
  const [invoice] = await db
    .select({ id: invoices.id, storeId: invoices.storeId, supplierId: invoices.supplierId, totalCost: invoices.totalCost, totalAmount: invoices.totalAmount, amountPaid: invoices.amountPaid, remainingDebt: invoices.remainingDebt, supplierReference: invoices.supplierReference, dueDate: invoices.dueDate, accountingNotes: invoices.accountingNotes, createdAt: invoices.createdAt, supplierName: suppliers.name, storeName: stores.name })
    .from(invoices)
    .innerJoin(suppliers, eq(invoices.supplierId, suppliers.id))
    .innerJoin(stores, eq(invoices.storeId, stores.id))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "The requested supplier invoice could not be found." });
  requireFinanceStore(user, invoice.storeId);
  return invoice as FinanceInvoice;
}

async function invoicePaymentTotal(db: any, invoiceId: number) {
  const [summary] = await db.select({ total: sql<string>`coalesce(sum(${supplierInvoicePayments.amount}), 0)` }).from(supplierInvoicePayments).where(eq(supplierInvoicePayments.invoiceId, invoiceId));
  return money(Number(summary?.total ?? 0));
}

export const financeRouter = router({
  suppliers: router({
    /** Lists the global vendor directory while strictly aggregating financial exposure only within the permitted branch scope. */
    list: financialProcedure.input(z.object({ storeId: z.number().int().positive().optional(), search: z.string().trim().max(120).default("") })).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = resolveFinanceStore(ctx.user, input.storeId);
      const invoiceRows = await db.select({ id: invoices.id, supplierId: invoices.supplierId, totalCost: invoices.totalCost, dueDate: invoices.dueDate, createdAt: invoices.createdAt }).from(invoices).where(storeId ? eq(invoices.storeId, storeId) : undefined);
      const authorizedSupplierIds = Array.from(new Set(invoiceRows.map(row => row.supplierId)));
      const supplierConditions = [
        ...(storeId ? [authorizedSupplierIds.length ? inArray(suppliers.id, authorizedSupplierIds) : sql`false`] : []),
        ...(input.search ? [or(like(suppliers.name, `%${input.search}%`), like(suppliers.contactName, `%${input.search}%`), like(suppliers.phone, `%${input.search}%`))] : []),
      ];
      const supplierRows = await db.select().from(suppliers).where(supplierConditions.length ? and(...supplierConditions) : undefined).orderBy(asc(suppliers.name));
      const invoiceIds = invoiceRows.map(row => row.id);
      const paymentRows = invoiceIds.length ? await db.select({ invoiceId: supplierInvoicePayments.invoiceId, amount: supplierInvoicePayments.amount }).from(supplierInvoicePayments).where(inArray(supplierInvoicePayments.invoiceId, invoiceIds)) : [];
      const paidByInvoice = new Map<number, number>();
      paymentRows.forEach(row => paidByInvoice.set(row.invoiceId, money((paidByInvoice.get(row.invoiceId) ?? 0) + Number(row.amount))));
      const totals = new Map<number, { invoiceCount: number; totalInvoiced: number; totalPaid: number; outstanding: number; overdue: number; latestInvoiceAt: Date | null }>();
      invoiceRows.forEach(invoice => {
        const current = totals.get(invoice.supplierId) ?? { invoiceCount: 0, totalInvoiced: 0, totalPaid: 0, outstanding: 0, overdue: 0, latestInvoiceAt: null };
        const totalCost = Number(invoice.totalCost); const paid = paidByInvoice.get(invoice.id) ?? 0; const outstanding = money(Math.max(0, totalCost - paid));
        current.invoiceCount += 1; current.totalInvoiced += totalCost; current.totalPaid += paid; current.outstanding += outstanding;
        if (invoice.dueDate && invoice.dueDate < new Date() && outstanding > 0) current.overdue += outstanding;
        if (!current.latestInvoiceAt || invoice.createdAt > current.latestInvoiceAt) current.latestInvoiceAt = invoice.createdAt;
        totals.set(invoice.supplierId, current);
      });
      return supplierRows.map(row => ({ ...row, ...(totals.get(row.id) ?? { invoiceCount: 0, totalInvoiced: 0, totalPaid: 0, outstanding: 0, overdue: 0, latestInvoiceAt: null }), totalInvoiced: money(totals.get(row.id)?.totalInvoiced ?? 0), totalPaid: money(totals.get(row.id)?.totalPaid ?? 0), outstanding: money(totals.get(row.id)?.outstanding ?? 0), overdue: money(totals.get(row.id)?.overdue ?? 0) }));
    }),
    create: financialProcedure.input(supplierDetailsSchema.extend({ storeId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      if (!isSuperAdmin(ctx.user)) requireFinanceStore(ctx.user, input.storeId);
      const [existing] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.name, input.name)).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "A supplier with this name already exists." });
      const result = await db.insert(suppliers).values({ name: input.name, contactName: input.contactName || null, phone: input.phone || null, email: input.email || null });
      return { supplierId: Number(result[0].insertId) };
    }),
    update: financialProcedure.input(supplierDetailsSchema.extend({ supplierId: z.number().int().positive(), storeId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      if (!isSuperAdmin(ctx.user)) requireFinanceStore(ctx.user, input.storeId);
      const [supplier] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
      if (!supplier) throw new TRPCError({ code: "NOT_FOUND", message: "The requested supplier could not be found." });
      const [collision] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.name, input.name), sql`${suppliers.id} != ${input.supplierId}`)).limit(1);
      if (collision) throw new TRPCError({ code: "CONFLICT", message: "Another supplier already uses this name." });
      await db.update(suppliers).set({ name: input.name, contactName: input.contactName || null, phone: input.phone || null, email: input.email || null }).where(eq(suppliers.id, input.supplierId));
      return { supplierId: input.supplierId };
    }),
    deductBalance: financialProcedure.input(z.object({ supplierId: z.number().int().positive(), storeId: z.number().int().positive().optional(), amount: z.number().finite().positive().max(9_999_999.99), note: z.string().trim().min(3).max(500) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = requireFinanceStore(ctx.user, input.storeId);
      return db.transaction(async tx => {
        const [supplier] = await tx.select({ id: suppliers.id, currentDebt: suppliers.currentDebt }).from(suppliers).where(eq(suppliers.id, input.supplierId)).for("update").limit(1);
        if (!supplier) throw new TRPCError({ code: "NOT_FOUND", message: "The requested supplier could not be found." });
        const deduction = money(Math.min(Number(supplier.currentDebt), input.amount));
        if (deduction <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "This supplier has no outstanding balance to deduct." });
        const paidAt = new Date();
        const payment = await tx.insert(supplierPayments).values({ supplierId: supplier.id, storeId, recordedByUserId: ctx.user.id, amount: deduction.toFixed(2), paymentMethod: "other", notes: input.note, paidAt });
        await tx.update(suppliers).set({ currentDebt: money(Number(supplier.currentDebt) - deduction).toFixed(2) }).where(eq(suppliers.id, supplier.id));
        return { supplierId: supplier.id, paymentId: Number(payment[0].insertId), deducted: deduction };
      });
    }),
  }),

  invoices: router({
    list: financialProcedure.input(optionalScopeSchema.safeExtend({ search: z.string().trim().max(120).default(""), onlyOutstanding: z.boolean().default(false) })).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = resolveFinanceStore(ctx.user, input.storeId);
      const conditions = [
        ...(storeId ? [eq(invoices.storeId, storeId)] : []),
        ...dateConditions(invoices.createdAt, input),
        ...(input.search ? [or(like(suppliers.name, `%${input.search}%`), like(invoices.supplierReference, `%${input.search}%`), like(invoices.originalFileName, `%${input.search}%`))] : []),
      ];
      const rows = await db.select({ id: invoices.id, storeId: invoices.storeId, storeName: stores.name, supplierId: invoices.supplierId, supplierName: suppliers.name, totalCost: invoices.totalCost, supplierReference: invoices.supplierReference, dueDate: invoices.dueDate, accountingNotes: invoices.accountingNotes, originalFileName: invoices.originalFileName, createdAt: invoices.createdAt }).from(invoices).innerJoin(suppliers, eq(invoices.supplierId, suppliers.id)).innerJoin(stores, eq(invoices.storeId, stores.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(invoices.createdAt)).limit(250);
      const invoiceIds = rows.map(row => row.id);
      const paymentRows = invoiceIds.length ? await db.select({ invoiceId: supplierInvoicePayments.invoiceId, amount: supplierInvoicePayments.amount }).from(supplierInvoicePayments).where(inArray(supplierInvoicePayments.invoiceId, invoiceIds)) : [];
      const paidByInvoice = new Map<number, number>();
      paymentRows.forEach(row => paidByInvoice.set(row.invoiceId, money((paidByInvoice.get(row.invoiceId) ?? 0) + Number(row.amount))));
      return rows.map(row => {
        const paidAmount = paidByInvoice.get(row.id) ?? 0; const outstanding = money(Math.max(0, Number(row.totalCost) - paidAmount));
        return { ...row, totalCost: money(Number(row.totalCost)), paidAmount, outstanding, paymentStatus: outstanding === 0 ? "paid" as const : paidAmount > 0 ? "partial" as const : "unpaid" as const, isOverdue: Boolean(row.dueDate && row.dueDate < new Date() && outstanding > 0) };
      }).filter(row => !input.onlyOutstanding || row.outstanding > 0);
    }),
    detail: financialProcedure.input(z.object({ invoiceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const invoice = await invoiceWithAccess(db, ctx.user, input.invoiceId);
      const [payments, lines] = await Promise.all([
        db.select({ id: supplierInvoicePayments.id, amount: supplierInvoicePayments.amount, paymentMethod: supplierInvoicePayments.paymentMethod, reference: supplierInvoicePayments.reference, notes: supplierInvoicePayments.notes, paidAt: supplierInvoicePayments.paidAt, recordedBy: users.name }).from(supplierInvoicePayments).leftJoin(users, eq(supplierInvoicePayments.recordedByUserId, users.id)).where(eq(supplierInvoicePayments.invoiceId, input.invoiceId)).orderBy(desc(supplierInvoicePayments.paidAt)),
        db.select({ id: supplierInvoiceLines.id, productName: supplierInvoiceLines.productName, quantity: supplierInvoiceLines.quantity, unitCost: supplierInvoiceLines.unitCost, reference: supplierInvoiceLines.reference }).from(supplierInvoiceLines).where(eq(supplierInvoiceLines.invoiceId, input.invoiceId)).orderBy(asc(supplierInvoiceLines.productName)),
      ]) as [InvoicePaymentRow[], InvoiceLineRow[]];
      const paidAmount = await invoicePaymentTotal(db, input.invoiceId);
      return { ...invoice, totalCost: money(Number(invoice.totalCost)), paidAmount, outstanding: money(Math.max(0, Number(invoice.totalCost) - paidAmount)), payments: payments.map(payment => ({ ...payment, amount: money(Number(payment.amount)) })), lines: lines.map(line => ({ ...line, unitCost: money(Number(line.unitCost)) })) };
    }),
    updateAccounting: financialProcedure.input(z.object({ invoiceId: z.number().int().positive(), supplierReference: z.string().trim().max(128).nullable(), dueDate: z.coerce.date().nullable(), accountingNotes: z.string().trim().max(500).nullable() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      await invoiceWithAccess(db, ctx.user, input.invoiceId);
      await db.update(invoices).set({ supplierReference: input.supplierReference || null, dueDate: input.dueDate, accountingNotes: input.accountingNotes || null }).where(eq(invoices.id, input.invoiceId));
      return { invoiceId: input.invoiceId };
    }),
    recordPayment: financialProcedure.input(z.object({ invoiceId: z.number().int().positive(), amount: z.number().finite().positive().max(9_999_999.99), paymentMethod: paymentMethodSchema, reference: z.string().trim().max(128).optional(), notes: z.string().trim().max(500).optional(), paidAt: z.coerce.date().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      // Authorize before the transaction; the transaction below re-reads the
      // payable after taking the supplier then invoice locks.
      const authorizedInvoice = await invoiceWithAccess(db, ctx.user, input.invoiceId);
      return db.transaction(async tx => {
        const [supplier] = await tx.select({ id: suppliers.id, currentDebt: suppliers.currentDebt }).from(suppliers).where(eq(suppliers.id, authorizedInvoice.supplierId)).for("update").limit(1);
        if (!supplier) throw new TRPCError({ code: "NOT_FOUND", message: "The requested supplier could not be found." });
        const [invoice] = await tx.select({ id: invoices.id, storeId: invoices.storeId, supplierId: invoices.supplierId, amountPaid: invoices.amountPaid, remainingDebt: invoices.remainingDebt })
          .from(invoices).where(eq(invoices.id, authorizedInvoice.id)).orderBy(asc(invoices.id)).for("update").limit(1);
        if (!invoice || invoice.supplierId !== supplier.id || invoice.storeId !== authorizedInvoice.storeId) throw new TRPCError({ code: "NOT_FOUND", message: "The requested supplier invoice could not be found." });
        const outstanding = money(Number(invoice.remainingDebt));
        if (input.amount > outstanding) throw new TRPCError({ code: "BAD_REQUEST", message: `Payment exceeds the remaining payable balance of ${outstanding.toFixed(2)} DZD.` });
        const paidAt = input.paidAt ?? new Date();
        const result = await tx.insert(supplierInvoicePayments).values({ invoiceId: invoice.id, storeId: invoice.storeId, recordedByUserId: ctx.user.id, amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, reference: input.reference || null, notes: input.notes || null, paidAt });
        const paymentResult = await tx.insert(supplierPayments).values({ supplierId: invoice.supplierId, storeId: invoice.storeId, recordedByUserId: ctx.user.id, amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, reference: input.reference || null, notes: input.notes || null, paidAt });
        await tx.insert(supplierPaymentAllocations).values({ paymentId: Number(paymentResult[0].insertId), invoiceId: invoice.id, amount: input.amount.toFixed(2) });
        const remainingBalance = money(outstanding - input.amount);
        await tx.update(invoices).set({ amountPaid: money(Number(invoice.amountPaid) + input.amount).toFixed(2), remainingDebt: remainingBalance.toFixed(2) }).where(eq(invoices.id, invoice.id));
        const remainingSupplierDebt = money(Math.max(0, Number(supplier.currentDebt) - input.amount));
        await tx.update(suppliers).set({ currentDebt: remainingSupplierDebt.toFixed(2) }).where(eq(suppliers.id, invoice.supplierId));
        return { paymentId: Number(result[0].insertId), invoiceId: invoice.id, remainingBalance };
      });
    }),
    deleteLine: financialProcedure.input(z.object({ lineId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const [line] = await db.select({ id: supplierInvoiceLines.id, invoiceId: supplierInvoiceLines.invoiceId, productId: supplierInvoiceLines.productId, storeId: supplierInvoiceLines.storeId, quantity: supplierInvoiceLines.quantity, unitCost: supplierInvoiceLines.unitCost }).from(supplierInvoiceLines).where(eq(supplierInvoiceLines.id, input.lineId)).limit(1);
      if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "The invoice line could not be found." });
      requireFinanceStore(ctx.user, line.storeId);
      return db.transaction(async tx => {
        const payments = await tx.select({ id: supplierInvoicePayments.id }).from(supplierInvoicePayments).where(eq(supplierInvoicePayments.invoiceId, line.invoiceId)).limit(1);
        if (payments.length) throw new TRPCError({ code: "CONFLICT", message: "Invoice lines with recorded payments cannot be changed. Delete or adjust the invoice balance first." });
        const [invoice] = await tx.select({ id: invoices.id, supplierId: invoices.supplierId, totalCost: invoices.totalCost, totalAmount: invoices.totalAmount, remainingDebt: invoices.remainingDebt }).from(invoices).where(eq(invoices.id, line.invoiceId)).for("update").limit(1);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "The supplier invoice no longer exists." });
        const [product] = await tx.select({ id: products.id, quantityOnHand: products.quantityOnHand }).from(products).where(eq(products.id, line.productId)).for("update").limit(1);
        if (!product || product.quantityOnHand < line.quantity) throw new TRPCError({ code: "CONFLICT", message: "The received quantity has already been used or changed and cannot be reversed automatically." });
        const [stock] = await tx.select({ id: stockEntries.id }).from(stockEntries).where(and(eq(stockEntries.invoiceId, line.invoiceId), eq(stockEntries.productId, line.productId), eq(stockEntries.quantity, line.quantity))).orderBy(asc(stockEntries.id)).limit(1);
        if (!stock) throw new TRPCError({ code: "CONFLICT", message: "The matching stock entry could not be found." });
        const delta = money(Number(line.unitCost) * line.quantity);
        await tx.update(products).set({ quantityOnHand: sql`${products.quantityOnHand} - ${line.quantity}` }).where(eq(products.id, product.id));
        await tx.delete(stockEntries).where(eq(stockEntries.id, stock.id));
        await tx.delete(supplierInvoiceLines).where(eq(supplierInvoiceLines.id, line.id));
        const newTotalCost = money(Math.max(0, Number(invoice.totalCost) - delta));
        const newTotalAmount = money(Math.max(0, Number(invoice.totalAmount) - delta));
        const newDebt = money(Math.max(0, Number(invoice.remainingDebt) - delta));
        await tx.update(invoices).set({ totalCost: newTotalCost.toFixed(2), totalAmount: newTotalAmount.toFixed(2), remainingDebt: newDebt.toFixed(2) }).where(eq(invoices.id, invoice.id));
        await tx.update(suppliers).set({ currentDebt: sql`GREATEST(0, ${suppliers.currentDebt} - ${delta.toFixed(2)})` }).where(eq(suppliers.id, invoice.supplierId));
        return { invoiceId: invoice.id, lineId: line.id };
      });
    }),
    delete: financialProcedure.input(z.object({ invoiceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const invoice = await invoiceWithAccess(db, ctx.user, input.invoiceId);
      return db.transaction(async tx => {
        const payments = await tx.select({ id: supplierInvoicePayments.id }).from(supplierInvoicePayments).where(eq(supplierInvoicePayments.invoiceId, invoice.id));
        const lines = await tx.select({ productId: supplierInvoiceLines.productId, quantity: supplierInvoiceLines.quantity }).from(supplierInvoiceLines).where(eq(supplierInvoiceLines.invoiceId, invoice.id));
        for (const line of lines) {
          const [product] = await tx.select({ id: products.id, quantityOnHand: products.quantityOnHand }).from(products).where(eq(products.id, line.productId)).for("update").limit(1);
          if (!product || product.quantityOnHand < line.quantity) throw new TRPCError({ code: "CONFLICT", message: "This invoice cannot be deleted because some received stock has already been used or changed." });
        }
        for (const line of lines) await tx.update(products).set({ quantityOnHand: sql`${products.quantityOnHand} - ${line.quantity}` }).where(eq(products.id, line.productId));
        const allocations = payments.length ? await tx.select({ paymentId: supplierPaymentAllocations.paymentId }).from(supplierPaymentAllocations).where(eq(supplierPaymentAllocations.invoiceId, invoice.id)) : [];
        await tx.delete(supplierPaymentAllocations).where(eq(supplierPaymentAllocations.invoiceId, invoice.id));
        if (allocations.length) await tx.delete(supplierPayments).where(inArray(supplierPayments.id, allocations.map(row => row.paymentId)));
        await tx.delete(supplierInvoicePayments).where(eq(supplierInvoicePayments.invoiceId, invoice.id));
        await tx.delete(stockEntries).where(eq(stockEntries.invoiceId, invoice.id));
        await tx.delete(supplierInvoiceLines).where(eq(supplierInvoiceLines.invoiceId, invoice.id));
        await tx.delete(invoiceExceptionDecisions).where(eq(invoiceExceptionDecisions.invoiceId, invoice.id));
        await tx.delete(invoices).where(eq(invoices.id, invoice.id));
        await tx.update(suppliers).set({ currentDebt: sql`GREATEST(0, ${suppliers.currentDebt} - ${Number(invoice.remainingDebt).toFixed(2)})` }).where(eq(suppliers.id, invoice.supplierId));
        return { invoiceId: invoice.id };
      });
    }),
  }),

  expenses: router({
    list: financialProcedure.input(optionalScopeSchema.safeExtend({ search: z.string().trim().max(120).default(""), includeVoided: z.boolean().default(false) })).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = resolveFinanceStore(ctx.user, input.storeId);
      const conditions = [
        ...(storeId ? [eq(operationalExpenses.storeId, storeId)] : []),
        ...dateConditions(operationalExpenses.occurredAt, input),
        ...(!input.includeVoided ? [eq(operationalExpenses.status, "posted")] : []),
        ...(input.search ? [or(like(operationalExpenses.category, `%${input.search}%`), like(operationalExpenses.description, `%${input.search}%`), like(stores.name, `%${input.search}%`))] : []),
      ];
      const rows = await db.select({ id: operationalExpenses.id, storeId: operationalExpenses.storeId, storeName: stores.name, category: operationalExpenses.category, description: operationalExpenses.description, amount: operationalExpenses.amount, paymentMethod: operationalExpenses.paymentMethod, status: operationalExpenses.status, occurredAt: operationalExpenses.occurredAt, voidedAt: operationalExpenses.voidedAt, voidReason: operationalExpenses.voidReason, recordedBy: users.name }).from(operationalExpenses).innerJoin(stores, eq(operationalExpenses.storeId, stores.id)).leftJoin(users, eq(operationalExpenses.recordedByUserId, users.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(operationalExpenses.occurredAt), desc(operationalExpenses.id)).limit(250);
      const totalPosted = money(rows.filter(row => row.status === "posted").reduce((total, row) => total + Number(row.amount), 0));
      return { totalPosted, rows: rows.map(row => ({ ...row, amount: money(Number(row.amount)) })) };
    }),
    create: financialProcedure.input(z.object({ storeId: z.number().int().positive(), category: z.string().trim().min(2).max(100), description: z.string().trim().min(2).max(500), amount: z.number().finite().positive().max(9_999_999.99), paymentMethod: paymentMethodSchema, occurredAt: z.coerce.date() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = requireFinanceStore(ctx.user, input.storeId);
      const result = await db.insert(operationalExpenses).values({ storeId, recordedByUserId: ctx.user.id, category: input.category, description: input.description, amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, occurredAt: input.occurredAt });
      return { expenseId: Number(result[0].insertId) };
    }),
    void: financialProcedure.input(z.object({ expenseId: z.number().int().positive(), reason: z.string().trim().min(3).max(500) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const [expense] = await db.select({ id: operationalExpenses.id, storeId: operationalExpenses.storeId, status: operationalExpenses.status }).from(operationalExpenses).where(eq(operationalExpenses.id, input.expenseId)).limit(1);
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "The requested expense could not be found." });
      requireFinanceStore(ctx.user, expense.storeId);
      if (expense.status === "voided") throw new TRPCError({ code: "CONFLICT", message: "This expense has already been voided." });
      await db.update(operationalExpenses).set({ status: "voided", voidedAt: new Date(), voidedByUserId: ctx.user.id, voidReason: input.reason }).where(eq(operationalExpenses.id, input.expenseId));
      return { expenseId: input.expenseId, status: "voided" as const };
    }),
  }),
});
