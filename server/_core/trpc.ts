import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export type BranchStaffRole = "admin" | "cashier" | "stock_manager" | "supervisor";
export type StaffRole = BranchStaffRole | "super_admin";

type BranchAwareUser = NonNullable<TrpcContext["user"]>;

function branchAssignments(user: BranchAwareUser): Array<{ storeId: number; role: BranchStaffRole }> {
  const pivotAssignments = (user as BranchAwareUser & { branchRoles?: Array<{ storeId: number; role: BranchStaffRole }> }).branchRoles;
  if (pivotAssignments?.length) return pivotAssignments;
  const legacyRole = user.role as BranchStaffRole;
  return user.storeId && ["admin", "cashier", "stock_manager", "supervisor"].includes(legacyRole) ? [{ storeId: user.storeId, role: legacyRole }] : [];
}

export function isSuperAdmin(user: BranchAwareUser) {
  const explicitSuperAdmin = (user as BranchAwareUser & { isSuperAdmin?: boolean }).isSuperAdmin;
  return Boolean(explicitSuperAdmin) || user.role === "super_admin";
}

/** Resolves the role strictly assigned to one branch, with no cross-branch fallback. */
export function requireBranchRole(user: BranchAwareUser, storeId: number, roles: BranchStaffRole[]) {
  if (isSuperAdmin(user)) return "super_admin" as const;
  const assignment = branchAssignments(user).find(item => item.storeId === storeId);
  if (!assignment || !roles.includes(assignment.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your assigned role is not authorized for this branch." });
  }
  return assignment.role;
}

export function assignedStoresForRoles(user: BranchAwareUser, roles: BranchStaffRole[]) {
  return branchAssignments(user).filter(item => roles.includes(item.role)).map(item => item.storeId);
}

/** Applies a server-enforced least-privilege role boundary to a procedure. */
export function roleProcedure(...roles: BranchStaffRole[]) {
  return protectedProcedure.use(
    t.middleware(async opts => {
      const user = opts.ctx.user;
      if (!user || (!isSuperAdmin(user) && !branchAssignments(user).some(assignment => roles.includes(assignment.role)))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your assigned role is not authorized to perform this action." });
      }
      return opts.next({ ctx: { ...opts.ctx, user } });
    })
  );
}

/** Inventory catalog, stock entry, and label functions; never exposes financial reporting. */
export const stockProcedure = roleProcedure("admin", "stock_manager");
/** Branch POS terminal functions for cashiers, supervisors, and explicit admin previews. */
export const posProcedure = roleProcedure("admin", "cashier", "supervisor");
/** Supervisor functions are limited to the assigned branch and daily operational review. */
export const supervisorProcedure = roleProcedure("admin", "supervisor");

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || !isSuperAdmin(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
