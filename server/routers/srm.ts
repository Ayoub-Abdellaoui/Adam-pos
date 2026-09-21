import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { invoiceExceptionDecisions, invoices, stores, supplierInvoiceLines, supplierInvoicePayments, supplierPaymentAllocations, supplierPayments, suppliers, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { assignedStoresForRoles, isSuperAdmin, requireBranchRole, roleProcedure, router, type BranchStaffRole } from "../_core/trpc";

const financialRoles: BranchStaffRole[] = ["admin", "supervisor"];
const accountsPayableProcedure = roleProcedure(...financialRoles);
const paymentMethodSchema = z.enum(["cash", "card", "bank_transfer", "mobile", "other"]);

function requireDb<T>(db: T): asserts db is Exclude<T, null> {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database service is unavailable." });
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function resolveFinancialStore(user: Parameters<typeof requireBranchRole>[0], requestedStoreId?: number) {
  if (isSuperAdmin(user)) return requestedStoreId;
  const assigned = assignedStoresForRoles(user, financialRoles);
  const storeId = requestedStoreId ?? (assigned.length === 1 ? assigned[0] : undefined);
  if (!storeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an authorized branch before accessing Accounts Payable." });
  requireBranchRole(user, storeId, financialRoles);
  return storeId;
}

const optionalScopeSchema = z.object({ storeId: z.number().int().positive().optional() });

/**
 * Backend-only SRM contracts. Every procedure is deliberately behind an
 * Admin/Supervisor role boundary, so Cashier callers receive a tRPC FORBIDDEN
 * response before supplier debt, payment, or payable data is queried.
 */
export const srmRouter = router({
  suppliers: router({
    /** Resolves a detected supplier name and optionally creates the profile in the same authorized scope. */
    recognizeOrCreate: accountsPayableProcedure
      .input(optionalScopeSchema.extend({ name: z.string().trim().min(1).max(255), createIfMissing: z.boolean().default(true) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb(); requireDb(db);
        resolveFinancialStore(ctx.user, input.storeId);
        const [existing] = await db.select().from(suppliers).where(eq(suppliers.name, input.name)).limit(1);
        if (existing) return { supplier: existing, created: false };
        if (!input.createIfMissing) return { supplier: null, created: false };
        const result = await db.insert(suppliers).values({ name: input.name });
        const supplierId = Number(result[0].insertId);
        const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);
        if (!supplier) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The detected supplier profile could not be created." });
        return { supplier, created: true };
      }),
    /** Authorized supplier relationship view with scoped payable, invoice, and payment history. */
    profile: accountsPayableProcedure.input(optionalScopeSchema.extend({ supplierId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = resolveFinancialStore(ctx.user, input.storeId);
      const [supplier] = await db.select({ id: suppliers.id, name: suppliers.name, contactName: suppliers.contactName, phone: suppliers.phone, email: suppliers.email, currentDebt: suppliers.currentDebt }).from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
      if (!supplier) throw new TRPCError({ code: "NOT_FOUND", message: "The requested supplier could not be found." });
      const invoiceRows = await db.select({ id: invoices.id, storeId: invoices.storeId, storeName: stores.name, totalAmount: invoices.totalAmount, amountPaid: invoices.amountPaid, remainingDebt: invoices.remainingDebt, supplierReference: invoices.supplierReference, dueDate: invoices.dueDate, originalFileName: invoices.originalFileName, createdAt: invoices.createdAt })
        .from(invoices).innerJoin(stores, eq(invoices.storeId, stores.id)).where(and(eq(invoices.supplierId, supplier.id), ...(storeId ? [eq(invoices.storeId, storeId)] : []))).orderBy(desc(invoices.createdAt));
      if (storeId && !invoiceRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "This supplier has no financial history in the authorized branch." });
      const paymentRows = await db.select({ id: supplierPayments.id, storeId: supplierPayments.storeId, storeName: stores.name, amount: supplierPayments.amount, paymentMethod: supplierPayments.paymentMethod, reference: supplierPayments.reference, notes: supplierPayments.notes, paidAt: supplierPayments.paidAt, recordedBy: users.name })
        .from(supplierPayments).leftJoin(stores, eq(supplierPayments.storeId, stores.id)).leftJoin(users, eq(supplierPayments.recordedByUserId, users.id)).where(and(eq(supplierPayments.supplierId, supplier.id), ...(storeId ? [eq(supplierPayments.storeId, storeId)] : []))).orderBy(desc(supplierPayments.paidAt));
      const scopedDebt = storeId ? money(invoiceRows.reduce((sum, row) => sum + Number(row.remainingDebt), 0)) : money(Number(supplier.currentDebt));
      return { ...supplier, currentDebt: scopedDebt, invoices: invoiceRows.map(invoice => ({ ...invoice, totalAmount: money(Number(invoice.totalAmount)), amountPaid: money(Number(invoice.amountPaid)), remainingDebt: money(Number(invoice.remainingDebt)) })), payments: paymentRows.map(payment => ({ ...payment, amount: money(Number(payment.amount)) })) };
    }),
  }),

  accountsPayable: router({
    /**
     * Global Super Admins receive the sum of supplier.currentDebt. Branch
     * Admins/Supervisors receive an isolated total from invoices in their branch.
     */
    globalTotal: accountsPayableProcedure.input(optionalScopeSchema).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = resolveFinancialStore(ctx.user, input.storeId);
      if (!storeId) {
        const [total] = await db.select({ totalDebt: sql<string>`coalesce(sum(${suppliers.currentDebt}), 0)` }).from(suppliers);
        return { totalDebt: money(Number(total?.totalDebt ?? 0)), scope: "enterprise" as const };
      }
      const [total] = await db.select({ totalDebt: sql<string>`coalesce(sum(${invoices.remainingDebt}), 0)` }).from(invoices).where(eq(invoices.storeId, storeId));
      return { totalDebt: money(Number(total?.totalDebt ?? 0)), scope: "branch" as const, storeId };
    }),

    /** Future profile/dashboard clients can use this authorized breakdown without calculating debt on the client. */
    supplierBalances: accountsPayableProcedure.input(optionalScopeSchema).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const storeId = resolveFinancialStore(ctx.user, input.storeId);
      if (!storeId) {
        const rows = await db.select({ supplierId: suppliers.id, supplierName: suppliers.name, currentDebt: suppliers.currentDebt }).from(suppliers).orderBy(asc(suppliers.name));
        return rows.map(row => ({ ...row, currentDebt: money(Number(row.currentDebt)) })).filter(row => row.currentDebt > 0);
      }
      const rows = await db.select({ supplierId: suppliers.id, supplierName: suppliers.name, currentDebt: sql<string>`coalesce(sum(${invoices.remainingDebt}), 0)` })
        .from(invoices).innerJoin(suppliers, eq(invoices.supplierId, suppliers.id)).where(eq(invoices.storeId, storeId)).groupBy(suppliers.id, suppliers.name).orderBy(asc(suppliers.name));
      return rows.map(row => ({ ...row, currentDebt: money(Number(row.currentDebt)) })).filter(row => row.currentDebt > 0);
    }),
  }),

  payments: router({
    /**
     * Registers one supplier payment and allocates it FIFO to outstanding
     * invoices. Each allocation updates invoice paid/debt snapshots, keeps the
     * legacy invoice payment ledger synchronized, and reduces currentDebt once.
     */
    register: accountsPayableProcedure
      .input(optionalScopeSchema.extend({
        supplierId: z.number().int().positive(),
        amount: z.number().finite().positive().max(9_999_999.99),
        paymentMethod: paymentMethodSchema.default("cash"),
        reference: z.string().trim().max(128).optional(),
        notes: z.string().trim().max(500).optional(),
        paidAt: z.coerce.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb(); requireDb(db);
        const storeId = resolveFinancialStore(ctx.user, input.storeId);
        return db.transaction(async tx => {
          const [supplier] = await tx.select({ id: suppliers.id, currentDebt: suppliers.currentDebt }).from(suppliers).where(eq(suppliers.id, input.supplierId)).for("update").limit(1);
          if (!supplier) throw new TRPCError({ code: "NOT_FOUND", message: "The requested supplier could not be found." });

          // All payment paths lock the shared supplier first, then invoice
          // rows by ascending primary key. Allocate from a separately sorted
          // copy so the existing FIFO business rule remains unchanged.
          const lockedOutstandingRows = await tx.select({ id: invoices.id, storeId: invoices.storeId, amountPaid: invoices.amountPaid, remainingDebt: invoices.remainingDebt, createdAt: invoices.createdAt })
            .from(invoices)
            .where(and(eq(invoices.supplierId, supplier.id), ...(storeId ? [eq(invoices.storeId, storeId)] : []), gt(invoices.remainingDebt, "0.00")))
            .orderBy(asc(invoices.id)).for("update");
          const outstandingRows = [...lockedOutstandingRows].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id - right.id);
          const payable = money(outstandingRows.reduce((sum, row) => sum + Number(row.remainingDebt), 0));
          if (input.amount > payable) throw new TRPCError({ code: "BAD_REQUEST", message: `Payment exceeds the authorized outstanding payable balance of ${payable.toFixed(2)} DZD.` });

          const paymentResult = await tx.insert(supplierPayments).values({
            supplierId: supplier.id,
            storeId: storeId ?? null,
            recordedByUserId: ctx.user.id,
            amount: input.amount.toFixed(2),
            paymentMethod: input.paymentMethod,
            reference: input.reference || null,
            notes: input.notes || null,
            paidAt: input.paidAt ?? new Date(),
          });
          const paymentId = Number(paymentResult[0].insertId);
          let unallocated = money(input.amount);
          const allocations: Array<{ invoiceId: number; amount: number }> = [];
          for (const invoice of outstandingRows) {
            if (unallocated <= 0) break;
            const allocation = money(Math.min(unallocated, Number(invoice.remainingDebt)));
            if (allocation <= 0) continue;
            allocations.push({ invoiceId: invoice.id, amount: allocation });
            await tx.insert(supplierPaymentAllocations).values({ paymentId, invoiceId: invoice.id, amount: allocation.toFixed(2) });
            await tx.insert(supplierInvoicePayments).values({
              invoiceId: invoice.id,
              storeId: invoice.storeId,
              recordedByUserId: ctx.user.id,
              amount: allocation.toFixed(2),
              paymentMethod: input.paymentMethod,
              reference: input.reference || null,
              notes: input.notes || null,
              paidAt: input.paidAt ?? new Date(),
            });
            await tx.update(invoices).set({
              amountPaid: money(Number(invoice.amountPaid) + allocation).toFixed(2),
              remainingDebt: money(Number(invoice.remainingDebt) - allocation).toFixed(2),
            }).where(eq(invoices.id, invoice.id));
            unallocated = money(unallocated - allocation);
          }
          if (unallocated !== 0) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The supplier payment could not be allocated completely." });
          const remainingSupplierDebt = money(Math.max(0, Number(supplier.currentDebt) - input.amount));
          await tx.update(suppliers).set({ currentDebt: remainingSupplierDebt.toFixed(2) }).where(eq(suppliers.id, supplier.id));
          return { paymentId, supplierId: supplier.id, paidAmount: money(input.amount), remainingSupplierDebt, allocations };
        });
      }),
  }),

  invoices: router({
    /** Full server-side supplier invoice detail with immutable line snapshots and payment allocations for future profile/print consumers. */
    detail: accountsPayableProcedure.input(z.object({ invoiceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb(); requireDb(db);
      const [invoice] = await db.select({ id: invoices.id, storeId: invoices.storeId, supplierId: invoices.supplierId, totalAmount: invoices.totalAmount, amountPaid: invoices.amountPaid, remainingDebt: invoices.remainingDebt, extractionPayload: invoices.extractionPayload, createdAt: invoices.createdAt })
        .from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "The requested supplier invoice could not be found." });
      resolveFinancialStore(ctx.user, invoice.storeId);
      const [lines, allocations, exceptions] = await Promise.all([
        db.select({ id: supplierInvoiceLines.id, productId: supplierInvoiceLines.productId, productName: supplierInvoiceLines.productName, reference: supplierInvoiceLines.reference, quantity: supplierInvoiceLines.quantity, unitCost: supplierInvoiceLines.unitCost, lineTotal: supplierInvoiceLines.lineTotal }).from(supplierInvoiceLines).where(eq(supplierInvoiceLines.invoiceId, invoice.id)).orderBy(asc(supplierInvoiceLines.id)),
        db.select({ paymentId: supplierPaymentAllocations.paymentId, amount: supplierPaymentAllocations.amount, paidAt: supplierPayments.paidAt, paymentMethod: supplierPayments.paymentMethod, reference: supplierPayments.reference }).from(supplierPaymentAllocations).innerJoin(supplierPayments, eq(supplierPaymentAllocations.paymentId, supplierPayments.id)).where(eq(supplierPaymentAllocations.invoiceId, invoice.id)).orderBy(asc(supplierPayments.paidAt)),
        db.select({ sourceIndex: invoiceExceptionDecisions.sourceIndex, kind: invoiceExceptionDecisions.kind, question: invoiceExceptionDecisions.question, decision: invoiceExceptionDecisions.decision, resolvedAt: invoiceExceptionDecisions.resolvedAt }).from(invoiceExceptionDecisions).where(eq(invoiceExceptionDecisions.invoiceId, invoice.id)).orderBy(asc(invoiceExceptionDecisions.sourceIndex)),
      ]);
      return {
        ...invoice,
        totalAmount: money(Number(invoice.totalAmount)),
        amountPaid: money(Number(invoice.amountPaid)),
        remainingDebt: money(Number(invoice.remainingDebt)),
        lines: lines.map(line => ({ ...line, unitCost: money(Number(line.unitCost)), lineTotal: money(Number(line.lineTotal)) })),
        payments: allocations.map(allocation => ({ ...allocation, amount: money(Number(allocation.amount)) })),
        exceptions,
      };
    }),
  }),
});
