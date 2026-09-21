import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { cashOuts, shifts, stores, userBranchRoles, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { assignedStoresForRoles, isSuperAdmin, requireBranchRole, roleProcedure, router, type BranchStaffRole } from "../_core/trpc";

const financialRoles: BranchStaffRole[] = ["admin", "supervisor"];
const cashOutProcedure = roleProcedure(...financialRoles);
const cashOutCategorySchema = z.enum(["employee_advance", "store_operations"]);
const storeInput = z.object({ storeId: z.number().int().positive().optional() });
const money = (value: number) => value.toFixed(2);

function requireDb<T>(db: T): asserts db is Exclude<T, null> {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database service is unavailable." });
}

function resolveCashOutStore(user: Parameters<typeof requireBranchRole>[0], requestedStoreId?: number, allowGlobal = false) {
  if (isSuperAdmin(user)) {
    if (!requestedStoreId && !allowGlobal) throw new TRPCError({ code: "BAD_REQUEST", message: "Select a branch before recording a cash withdrawal." });
    return requestedStoreId;
  }
  const permitted = assignedStoresForRoles(user, financialRoles);
  const storeId = requestedStoreId ?? (permitted.length === 1 ? permitted[0] : undefined);
  if (!storeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an authorized branch before continuing." });
  requireBranchRole(user, storeId, financialRoles);
  return storeId;
}

const activeShiftInput = storeInput;
const employeeSearchInput = storeInput.extend({ query: z.string().trim().max(120).default(""), limit: z.number().int().min(1).max(30).default(12) });
const ledgerInput = storeInput.extend({ from: z.date().optional(), to: z.date().optional(), category: cashOutCategorySchema.optional(), employeeUserId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(250).default(100) });

export const cashOutRouter = router({
  /** Open drawers available for an authorized manager to select when more than one cashier shift is active. */
  activeShifts: cashOutProcedure.input(activeShiftInput).query(async ({ ctx, input }) => {
    const storeId = resolveCashOutStore(ctx.user, input.storeId);
    const db = await getDb(); requireDb(db);
    return db.select({ id: shifts.id, cashierUserId: shifts.cashierUserId, cashierName: users.name, openingCash: shifts.openingCash, expectedCash: shifts.expectedCash, openedAt: shifts.openedAt })
      .from(shifts).innerJoin(users, eq(users.id, shifts.cashierUserId))
      .where(and(eq(shifts.storeId, storeId!), eq(shifts.status, "open"))).orderBy(desc(shifts.openedAt));
  }),

  /** Search only employee identities assigned to the active branch before posting a salary advance. */
  employeeSearch: cashOutProcedure.input(employeeSearchInput).query(async ({ ctx, input }) => {
    const storeId = resolveCashOutStore(ctx.user, input.storeId);
    const db = await getDb(); requireDb(db);
    const query = input.query.trim();
    const match = query ? or(like(users.name, `%${query}%`), like(users.email, `%${query}%`)) : undefined;
    return db.select({ userId: users.id, name: users.name, email: users.email, role: userBranchRoles.role })
      .from(userBranchRoles).innerJoin(users, eq(users.id, userBranchRoles.userId))
      .where(and(eq(userBranchRoles.storeId, storeId!), ...(match ? [match] : [])))
      .orderBy(users.name).limit(input.limit);
  }),

  /** Records a physical drawer withdrawal and atomically reduces the selected open shift's expected balance. */
  create: cashOutProcedure.input(storeInput.extend({ shiftId: z.number().int().positive(), category: cashOutCategorySchema, amount: z.number().finite().positive().max(9_999_999.99), recipientUserId: z.number().int().positive().optional(), notes: z.string().trim().min(2).max(500) })).mutation(async ({ ctx, input }) => {
    const storeId = resolveCashOutStore(ctx.user, input.storeId);
    if (input.category === "employee_advance" && !input.recipientUserId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select the employee receiving this salary advance." });
    if (input.category === "store_operations" && input.recipientUserId) throw new TRPCError({ code: "BAD_REQUEST", message: "Operational cash-outs cannot be assigned to an employee." });
    const db = await getDb(); requireDb(db);
    return db.transaction(async tx => {
      const [shift] = await tx.select({ id: shifts.id, expectedCash: shifts.expectedCash }).from(shifts).where(and(eq(shifts.id, input.shiftId), eq(shifts.storeId, storeId!), eq(shifts.status, "open"))).limit(1);
      if (!shift) throw new TRPCError({ code: "NOT_FOUND", message: "The selected active shift is unavailable." });
      if (input.recipientUserId) {
        const [employee] = await tx.select({ userId: userBranchRoles.userId }).from(userBranchRoles).where(and(eq(userBranchRoles.storeId, storeId!), eq(userBranchRoles.userId, input.recipientUserId))).limit(1);
        if (!employee) throw new TRPCError({ code: "FORBIDDEN", message: "The selected employee is not assigned to this branch." });
      }
      if (Number(shift.expectedCash) < input.amount) throw new TRPCError({ code: "CONFLICT", message: "Cash Out amount exceeds the shift's expected cash balance." });
      const shiftUpdate = await tx.update(shifts).set({ expectedCash: sql`${shifts.expectedCash} - ${money(input.amount)}` }).where(and(eq(shifts.id, shift.id), eq(shifts.status, "open"), gte(shifts.expectedCash, money(input.amount))));
      if (Number(shiftUpdate[0].affectedRows) !== 1) throw new TRPCError({ code: "CONFLICT", message: "The drawer balance changed. Review the current shift total and try again." });
      const created = await tx.insert(cashOuts).values({ storeId: storeId!, shiftId: shift.id, category: input.category, amount: money(input.amount), recipientUserId: input.recipientUserId ?? null, recordedByUserId: ctx.user.id, notes: input.notes });
      return { cashOutId: Number(created[0].insertId), shiftId: shift.id, expectedCash: money(Number(shift.expectedCash) - input.amount) };
    });
  }),

  /** Immutable chronological ledger of drawer withdrawals, scoped server-side to the requesting manager's branch access. */
  ledger: cashOutProcedure.input(ledgerInput).query(async ({ ctx, input }) => {
    const storeId = resolveCashOutStore(ctx.user, input.storeId, true);
    const db = await getDb(); requireDb(db);
    const conditions = [
      ...(storeId ? [eq(cashOuts.storeId, storeId)] : []),
      ...(input.from ? [gte(cashOuts.createdAt, input.from)] : []),
      ...(input.to ? [lte(cashOuts.createdAt, input.to)] : []),
      ...(input.category ? [eq(cashOuts.category, input.category)] : []),
      ...(input.employeeUserId ? [eq(cashOuts.recipientUserId, input.employeeUserId)] : []),
    ];
    return db.select({ id: cashOuts.id, storeId: cashOuts.storeId, storeName: stores.name, shiftId: cashOuts.shiftId, category: cashOuts.category, amount: cashOuts.amount, recipientUserId: cashOuts.recipientUserId, employeeName: users.name, notes: cashOuts.notes, createdAt: cashOuts.createdAt })
      .from(cashOuts).innerJoin(stores, eq(stores.id, cashOuts.storeId)).leftJoin(users, eq(users.id, cashOuts.recipientUserId))
      .where(conditions.length ? and(...conditions) : undefined).orderBy(desc(cashOuts.createdAt)).limit(input.limit);
  }),

  /** Employee-profile advance tab data; this endpoint intentionally includes only salary/advance entries. */
  employeeAdvances: cashOutProcedure.input(storeInput.extend({ userId: z.number().int().positive(), from: z.date().optional(), to: z.date().optional() })).query(async ({ ctx, input }) => {
    const storeId = resolveCashOutStore(ctx.user, input.storeId);
    const db = await getDb(); requireDb(db);
    const rows = await db.select({ id: cashOuts.id, amount: cashOuts.amount, notes: cashOuts.notes, createdAt: cashOuts.createdAt, shiftId: cashOuts.shiftId, employeeName: users.name, employeeEmail: users.email })
      .from(cashOuts).innerJoin(users, eq(users.id, cashOuts.recipientUserId))
      .where(and(eq(cashOuts.storeId, storeId!), eq(cashOuts.recipientUserId, input.userId), eq(cashOuts.category, "employee_advance"), ...(input.from ? [gte(cashOuts.createdAt, input.from)] : []), ...(input.to ? [lte(cashOuts.createdAt, input.to)] : [])))
      .orderBy(desc(cashOuts.createdAt));
    return { total: money(rows.reduce((sum, entry) => sum + Number(entry.amount), 0)), entries: rows };
  }),
});
