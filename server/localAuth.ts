import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { localCredentials, userBranchRoles, users } from "../drizzle/schema";
import { getDb } from "./db";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export type BranchRole = "admin" | "cashier" | "stock_manager" | "supervisor";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidLocalPassword(password: string) {
  return password.length >= 12
    && password.length <= 128
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password);
}

function assertValidLocalPassword(password: string) {
  if (!isValidLocalPassword(password)) {
    throw new Error("Password must be at least 12 characters and include uppercase, lowercase, and a number.");
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltValue, hashValue] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    const derived = (await scrypt(password, salt, expected.length)) as Buffer;
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Enrolls credentials for an existing authenticated user without changing the user identity or permissions. */
export async function enrollLocalCredentials(input: {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database service is unavailable.");
  const email = normalizeEmail(input.email);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  assertValidLocalPassword(input.password);
  if (!firstName || !lastName || !email) throw new Error("Name and email are required.");

  return db.transaction(async tx => {
    const [user] = await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user) throw new Error("User account not found.");

    const [existingCredential] = await tx.select({ userId: localCredentials.userId }).from(localCredentials).where(eq(localCredentials.userId, input.userId)).limit(1);
    if (existingCredential) throw new Error("This user already has local credentials.");

    // Serialize enrollment operations through the existing table rows. This is
    // an application-level uniqueness guard; no schema/index change is made.
    const existingEmails = await tx.select({ userId: localCredentials.userId, email: localCredentials.email }).from(localCredentials).for("update");
    if (existingEmails.some(record => normalizeEmail(record.email) === email)) {
      throw new Error("An employee account already uses this email address.");
    }

    const passwordHash = await hashPassword(input.password);
    await tx.insert(localCredentials).values({
      userId: input.userId,
      email,
      firstName,
      lastName,
      passwordHash,
    });
    return { userId: user.id, email, name: user.name };
  });
}

export async function createLocalEmployee(input: { firstName: string; lastName: string; email: string; password: string; globalRole?: "super_admin"; branch?: { storeId: number; role: BranchRole } }) {
  const db = await getDb();
  if (!db) throw new Error("Database service is unavailable.");
  const email = normalizeEmail(input.email);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  assertValidLocalPassword(input.password);
  const [credential] = await db.select({ userId: localCredentials.userId }).from(localCredentials).where(eq(localCredentials.email, email)).limit(1);
  const [oauthIdentity] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (credential || oauthIdentity) throw new Error("An employee account already uses this email address.");
  const passwordHash = await hashPassword(input.password);
  const openId = `local_${randomBytes(18).toString("base64url")}`;
  return db.transaction(async tx => {
    const result = await tx.insert(users).values({ openId, name: `${firstName} ${lastName}`, email, loginMethod: "local_password", role: input.globalRole ?? "cashier", storeId: null, lastSignedIn: new Date() });
    const userId = Number(result[0].insertId);
    await tx.insert(localCredentials).values({ userId, email, firstName, lastName, passwordHash });
    if (input.branch) await tx.insert(userBranchRoles).values({ userId, storeId: input.branch.storeId, role: input.branch.role });
    return { userId, openId, email, name: `${firstName} ${lastName}` };
  });
}

export async function changeLocalEmployeePassword(input: { userId: number; password: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database service is unavailable.");
  assertValidLocalPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  const result = await db.update(localCredentials).set({ passwordHash, updatedAt: new Date() }).where(eq(localCredentials.userId, input.userId));
  if (Number(result[0].affectedRows) !== 1) throw new Error("This user does not have local credentials.");
  return { userId: input.userId };
}

export async function findLocalEmployeeByEmail(emailInput: string) {
  const db = await getDb();
  if (!db) return undefined;
  const email = normalizeEmail(emailInput);
  const [record] = await db.select({ user: users, passwordHash: localCredentials.passwordHash }).from(localCredentials).innerJoin(users, eq(localCredentials.userId, users.id)).where(eq(localCredentials.email, email)).limit(1);
  return record;
}
