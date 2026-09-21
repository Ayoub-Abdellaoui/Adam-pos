import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { stores, userBranchRoles, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { adminProcedure, requireBranchRole, roleProcedure, router } from "../_core/trpc";
import { changeLocalEmployeePassword, createLocalEmployee } from "../localAuth";

const branchRoleSchema = z.enum(["admin", "cashier", "stock_manager", "supervisor"]);
const branchInput = z.object({ storeId: z.number().int().positive() });
const assignmentInput = branchInput.extend({
  openId: z.string().trim().min(3).max(64),
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(320).optional(),
  role: branchRoleSchema,
});
const superAdminInput = z.object({ openId: z.string().trim().min(3).max(64), name: z.string().trim().min(1).max(255), email: z.string().trim().email().max(320).optional() });
const globalAccessInput = z.object({ userId: z.number().int().positive(), globalRole: z.enum(["super_admin", "none"]) });
const globalDirectoryInput = z.object({ page: z.number().int().positive().default(1), pageSize: z.number().int().min(5).max(100).default(20) });
const globalDirectoryUpdateInput = z.object({ userId: z.number().int().positive(), globalRole: z.enum(["super_admin", "none"]), assignments: z.array(z.object({ storeId: z.number().int().positive(), role: branchRoleSchema })).max(50) });
const localEmployeeInput = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320),
  password: z.string().min(12, "Password must be at least 12 characters.").max(128).refine(value => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value), "Password must include uppercase, lowercase, and a number."),
});

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database service is unavailable." });
  return db;
}

async function requireActiveStore(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, storeId: number) {
  const [store] = await db.select({ id: stores.id, name: stores.name }).from(stores).where(and(eq(stores.id, storeId), eq(stores.isActive, true))).limit(1);
  if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "The selected active branch does not exist." });
  return store;
}

function assertNotPrimaryOwner(openId: string) {
  if (ENV.ownerOpenId && openId === ENV.ownerOpenId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "The primary owner Super Admin role cannot be changed or removed." });
  }
}

/** User identities are global; role grants are isolated to user_branch_roles. */
export const usersRouter = router({
  directory: router({
    list: adminProcedure.input(globalDirectoryInput).query(async ({ input }) => {
      const db = await requireDb();
      const offset = (input.page - 1) * input.pageSize;
      const [totalRow] = await db.select({ total: count() }).from(users);
      const accountRows = await db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, role: users.role, storeId: users.storeId, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt })
        .from(users).orderBy(asc(users.name), asc(users.id)).limit(input.pageSize).offset(offset);
      const accountIds = accountRows.map(account => account.id);
      const assignmentRows = accountIds.length
        ? await db.select({ userId: userBranchRoles.userId, storeId: userBranchRoles.storeId, storeName: stores.name, role: userBranchRoles.role })
          .from(userBranchRoles).innerJoin(stores, eq(userBranchRoles.storeId, stores.id)).where(inArray(userBranchRoles.userId, accountIds)).orderBy(asc(stores.name))
        : [];
      const assignmentsByUser = new Map<number, typeof assignmentRows>();
      for (const assignment of assignmentRows) {
        const existing = assignmentsByUser.get(assignment.userId) ?? [];
        existing.push(assignment);
        assignmentsByUser.set(assignment.userId, existing);
      }
      const activeBranches = await db.select({ id: stores.id, name: stores.name, code: stores.code }).from(stores).where(eq(stores.isActive, true)).orderBy(asc(stores.name));
      return {
        users: accountRows.map(account => ({
          ...account,
          globalRole: account.role === "super_admin" ? "super_admin" as const : "none" as const,
          assignments: assignmentsByUser.get(account.id) ?? [],
        })),
        branches: activeBranches,
        page: input.page,
        pageSize: input.pageSize,
        total: Number(totalRow?.total ?? 0),
        pageCount: Math.max(1, Math.ceil(Number(totalRow?.total ?? 0) / input.pageSize)),
      };
    }),
    update: adminProcedure.input(globalDirectoryUpdateInput).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [target] = await db.select({ id: users.id, openId: users.openId, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "The requested user does not exist." });
      if (input.globalRole === "none") assertNotPrimaryOwner(target.openId);
      const uniqueStoreIds = new Set(input.assignments.map(assignment => assignment.storeId));
      if (uniqueStoreIds.size !== input.assignments.length) throw new TRPCError({ code: "BAD_REQUEST", message: "A branch can only be assigned once per user." });
      if (input.globalRole === "none" && input.userId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "A Super Admin cannot remove their own global access." });
      if (input.globalRole === "none" && target.role === "super_admin") {
        const [remaining] = await db.select({ total: count() }).from(users).where(eq(users.role, "super_admin"));
        if (Number(remaining?.total ?? 0) <= 1) throw new TRPCError({ code: "CONFLICT", message: "At least one Super Admin must remain active." });
      }
      if (input.assignments.length) {
        const validBranches = await db.select({ id: stores.id }).from(stores).where(and(eq(stores.isActive, true), inArray(stores.id, Array.from(uniqueStoreIds))));
        if (validBranches.length !== uniqueStoreIds.size) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more selected branches are not active." });
      }
      await db.transaction(async tx => {
        await tx.delete(userBranchRoles).where(eq(userBranchRoles.userId, input.userId));
        if (input.globalRole === "super_admin") {
          await tx.update(users).set({ role: "super_admin", storeId: null }).where(eq(users.id, input.userId));
        } else {
          await tx.update(users).set({ role: "cashier", storeId: null }).where(eq(users.id, input.userId));
          if (input.assignments.length) await tx.insert(userBranchRoles).values(input.assignments.map(assignment => ({ userId: input.userId, storeId: assignment.storeId, role: assignment.role })));
        }
      });
      return { userId: input.userId, globalRole: input.globalRole, assignments: input.globalRole === "super_admin" ? [] : input.assignments };
    }),
    create: adminProcedure.input(localEmployeeInput).mutation(async ({ input }) => {
      try {
        return await createLocalEmployee(input);
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Employee account could not be created." });
      }
    }),
    remove: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "A Super Admin cannot delete their own account." });
      const db = await requireDb();
      const [target] = await db.select({ id: users.id, openId: users.openId, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "The requested user does not exist." });
      assertNotPrimaryOwner(target.openId);
      if (target.role === "super_admin") {
        const [remaining] = await db.select({ count: count() }).from(users).where(eq(users.role, "super_admin"));
        if (Number(remaining?.count ?? 0) <= 1) throw new TRPCError({ code: "CONFLICT", message: "At least one Super Admin must remain active." });
      }
      try {
        await db.transaction(async tx => {
          await tx.delete(userBranchRoles).where(eq(userBranchRoles.userId, input.userId));
          await tx.delete(users).where(eq(users.id, input.userId));
        });
      } catch {
        throw new TRPCError({ code: "CONFLICT", message: "This user has historical records and cannot be deleted without breaking referential integrity." });
      }
      return { userId: input.userId };
    }),
    changePassword: adminProcedure.input(z.object({ userId: z.number().int().positive(), password: localEmployeeInput.shape.password })).mutation(async ({ input }) => {
      try {
        return await changeLocalEmployeePassword(input);
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Password could not be changed." });
      }
    }),
  }),

  superAdmins: router({
    list: adminProcedure.query(async () => {
      const db = await requireDb();
      return db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt })
        .from(users).where(eq(users.role, "super_admin")).orderBy(asc(users.name));
    }),
    create: adminProcedure.input(superAdminInput).mutation(async ({ input }) => {
      const db = await requireDb();
      const [existing] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.openId, input.openId)).limit(1);
      if (existing) {
        await db.update(users).set({ name: input.name, email: input.email ?? null, role: "super_admin", storeId: null }).where(eq(users.id, existing.id));
        return { userId: existing.id, created: false };
      }
      const result = await db.insert(users).values({ openId: input.openId, name: input.name, email: input.email ?? null, loginMethod: "manus", role: "super_admin", storeId: null, lastSignedIn: new Date() });
      return { userId: Number(result[0].insertId), created: true };
    }),
    createLocal: adminProcedure.input(localEmployeeInput).mutation(async ({ input }) => {
      try {
        return await createLocalEmployee({ ...input, globalRole: "super_admin" });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Employee account could not be created." });
      }
    }),
    update: adminProcedure.input(globalAccessInput).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [target] = await db.select({ id: users.id, openId: users.openId, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "The requested user does not exist." });
      if (input.globalRole === "none") {
        assertNotPrimaryOwner(target.openId);
        if (input.userId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "A Super Admin cannot remove their own global access." });
        const [remaining] = await db.select({ count: count() }).from(users).where(eq(users.role, "super_admin"));
        if (target.role === "super_admin" && Number(remaining?.count ?? 0) <= 1) throw new TRPCError({ code: "CONFLICT", message: "At least one Super Admin must remain active." });
        await db.update(users).set({ role: "cashier" }).where(eq(users.id, input.userId));
      } else {
        await db.update(users).set({ role: "super_admin", storeId: null }).where(eq(users.id, input.userId));
      }
      return { userId: input.userId, globalRole: input.globalRole };
    }),
    remove: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "A Super Admin cannot remove their own global access." });
      const db = await requireDb();
      const [target] = await db.select({ id: users.id, openId: users.openId, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target || target.role !== "super_admin") throw new TRPCError({ code: "NOT_FOUND", message: "The requested Super Admin does not exist." });
      assertNotPrimaryOwner(target.openId);
      const [remaining] = await db.select({ count: count() }).from(users).where(eq(users.role, "super_admin"));
      if (Number(remaining?.count ?? 0) <= 1) throw new TRPCError({ code: "CONFLICT", message: "At least one Super Admin must remain active." });
      await db.update(users).set({ role: "cashier" }).where(eq(users.id, input.userId));
      return { userId: input.userId };
    }),
  }),

  branchStaff: router({
    list: roleProcedure("admin").input(branchInput).query(async ({ ctx, input }) => {
      requireBranchRole(ctx.user, input.storeId, ["admin"]);
      const db = await requireDb();
      return db.select({ assignmentId: userBranchRoles.id, userId: users.id, openId: users.openId, name: users.name, email: users.email, role: userBranchRoles.role, lastSignedIn: users.lastSignedIn, createdAt: userBranchRoles.createdAt })
        .from(userBranchRoles).innerJoin(users, eq(userBranchRoles.userId, users.id)).where(eq(userBranchRoles.storeId, input.storeId)).orderBy(asc(users.name));
    }),
    assign: roleProcedure("admin").input(assignmentInput).mutation(async ({ ctx, input }) => {
      requireBranchRole(ctx.user, input.storeId, ["admin"]);
      const db = await requireDb();
      await requireActiveStore(db, input.storeId);
      let [account] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.openId, input.openId)).limit(1);
      if (account?.role === "super_admin") throw new TRPCError({ code: "CONFLICT", message: "Super Admin accounts already have global access and cannot receive a limited branch role." });
      if (!account) {
        const result = await db.insert(users).values({ openId: input.openId, name: input.name, email: input.email ?? null, loginMethod: "manus", role: "cashier", storeId: null, lastSignedIn: new Date() });
        account = { id: Number(result[0].insertId), role: "cashier" };
      } else {
        await db.update(users).set({ name: input.name, email: input.email ?? null, storeId: null }).where(eq(users.id, account.id));
      }
      await db.insert(userBranchRoles).values({ userId: account.id, storeId: input.storeId, role: input.role }).onDuplicateKeyUpdate({ set: { role: input.role, updatedAt: new Date() } });
      return { userId: account.id, storeId: input.storeId, role: input.role };
    }),
    createLocal: roleProcedure("admin").input(branchInput.extend({ ...localEmployeeInput.shape, role: branchRoleSchema })).mutation(async ({ ctx, input }) => {
      requireBranchRole(ctx.user, input.storeId, ["admin"]);
      const db = await requireDb();
      await requireActiveStore(db, input.storeId);
      try {
        return await createLocalEmployee({ firstName: input.firstName, lastName: input.lastName, email: input.email, password: input.password, branch: { storeId: input.storeId, role: input.role } });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Employee account could not be created." });
      }
    }),
    remove: roleProcedure("admin").input(branchInput.extend({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      requireBranchRole(ctx.user, input.storeId, ["admin"]);
      const db = await requireDb();
      const result = await db.delete(userBranchRoles).where(and(eq(userBranchRoles.userId, input.userId), eq(userBranchRoles.storeId, input.storeId)));
      if (Number(result[0].affectedRows) !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "No role assignment exists for this employee at the selected branch." });
      return { userId: input.userId, storeId: input.storeId };
    }),
    update: roleProcedure("admin").input(branchInput.extend({ userId: z.number().int().positive(), role: branchRoleSchema })).mutation(async ({ ctx, input }) => {
      requireBranchRole(ctx.user, input.storeId, ["admin"]);
      const db = await requireDb();
      const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "The requested employee no longer exists." });
      if (target.role === "super_admin") throw new TRPCError({ code: "CONFLICT", message: "Super Admin access can only be changed from global role management." });
      const result = await db.update(userBranchRoles).set({ role: input.role, updatedAt: new Date() }).where(and(eq(userBranchRoles.userId, input.userId), eq(userBranchRoles.storeId, input.storeId)));
      if (Number(result[0].affectedRows) !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "No role assignment exists for this employee at the selected branch." });
      return { userId: input.userId, storeId: input.storeId, role: input.role };
    }),
  }),
});
