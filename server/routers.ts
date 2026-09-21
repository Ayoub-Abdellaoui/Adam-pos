import { COOKIE_NAME, SESSION_DURATION_MS } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import { enrollLocalCredentials, findLocalEmployeeByEmail, normalizeEmail, verifyPassword } from "./localAuth";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { inventoryRouter } from "./routers/inventory";
import { enterpriseRouter } from "./routers/enterprise";
import { financeRouter } from "./routers/finance";
import { srmRouter } from "./routers/srm";
import { posRouter } from "./routers/pos";
import { usersRouter } from "./routers/users";
import { cashOutRouter } from "./routers/cashOut";

const localLoginAttempts = new Map<string, { failures: number; resetAt: number }>();
const LOCAL_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOCAL_LOGIN_FAILURES = 5;

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    enroll: protectedProcedure.input(z.object({
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().min(1).max(100),
      email: z.string().trim().email().max(320),
      password: z.string().min(12).max(128),
    })).mutation(async ({ ctx, input }) => {
      try {
        return await enrollLocalCredentials({ userId: ctx.user.id, ...input });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Local credentials could not be enrolled." });
      }
    }),
    localLogin: publicProcedure.input(z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      const key = `${ctx.req.ip ?? "unknown"}:${email}`;
      const current = localLoginAttempts.get(key);
      if (current && current.resetAt > Date.now() && current.failures >= MAX_LOCAL_LOGIN_FAILURES) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many sign-in attempts. Please wait 15 minutes and try again." });
      }
      const record = await findLocalEmployeeByEmail(email);
      const valid = Boolean(record && await verifyPassword(input.password, record.passwordHash));
      if (!valid || !record) {
        const failures = (current?.resetAt && current.resetAt > Date.now() ? current.failures : 0) + 1;
        localLoginAttempts.set(key, { failures, resetAt: Date.now() + LOCAL_LOGIN_WINDOW_MS });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email address or password is incorrect." });
      }
      localLoginAttempts.delete(key);
      const token = await sdk.createSessionToken(record.user.openId, { name: record.user.name ?? "Employee" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_DURATION_MS });
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  inventory: inventoryRouter,
  enterprise: enterpriseRouter,
  finance: financeRouter,
  srm: srmRouter,
  pos: posRouter,
  users: usersRouter,
  cashOut: cashOutRouter,
  ocrSpaceTest: router({
    run: adminProcedure.input(z.object({ dataUrl: z.string().min(32).max(12_000_000) })).mutation(() => {
      return {
        engine: "disabled",
        language: "",
        tableRecognition: false,
        processingTimeMs: null,
        text: "OCR.space invoice processing is disabled. Use Manus Vision invoice extraction instead.",
        structuredRows: [] as Array<{ productName: string; reference: string | null; quantity: number | null; costPrice: number | null; totalAmount: number | null }>,
        extraction: null,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
