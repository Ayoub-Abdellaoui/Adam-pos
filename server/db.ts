import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, stores, userBranchRoles, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

/** Parse the managed custom TiDB URL into a TLS-enabled mysql2 connection config. */
function getExternalDatabaseConfig() {
  const connectionString = ENV.databaseUrl;
  if (!connectionString) return null;

  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
    ssl: { rejectUnauthorized: true },
  };
}

/** Lazily initialize the exclusive external TiDB database connection for server procedures. */
export async function getDb() {
  if (!_db) {
    const connection = getExternalDatabaseConfig();
    if (!connection) {
      console.error("[Database] EXTERNAL_DATABASE_URL is not configured.");
      return null;
    }

    try {
      _db = drizzle({ connection });
    } catch (error) {
      console.warn("[Database] Failed to connect to external TiDB:", error);
      _db = null;
    }
  }
  return _db;
}

/** Executes a minimal query for readiness probes without touching application data. */
export async function isDatabaseReady(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

/** Keeps the OAuth identity record in sync while retaining the assigned retail role and store. */
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };

  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }

  // The configured project owner is the first Super Admin. All other users are
  // identities only until a Super Admin grants a branch-specific role.
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "super_admin";
    updateSet.role = "super_admin";
  } else {
    values.role = "cashier";
  }

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  let [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (!user) return undefined;

  // The configured owner is the permanent root account. Reassert this during
  // every session hydration so an old database row or an accidental role edit
  // can never leave the owner without global recovery access.
  if (ENV.ownerOpenId && user.openId === ENV.ownerOpenId && user.role !== "super_admin") {
    await db.update(users).set({ role: "super_admin", storeId: null }).where(eq(users.id, user.id));
    user = { ...user, role: "super_admin", storeId: null };
  }

  const branchRoles = await db.select({ storeId: userBranchRoles.storeId, role: userBranchRoles.role })
    .from(userBranchRoles).where(eq(userBranchRoles.userId, user.id));
  return { ...user, branchRoles, isSuperAdmin: user.role === "super_admin" };
}

/** Ensures the three fixed retail branches exist without introducing demo sales or product data. */
export async function ensureRetailBranches() {
  const db = await getDb();
  if (!db) throw new Error("Database service is unavailable.");

  const requiredBranches = [
    { name: "Cosmetics", type: "cosmetics" as const, code: "COS" },
    { name: "Bookstore", type: "bookstore" as const, code: "BOOK" },
    { name: "Clothing", type: "clothing" as const, code: "CLOTH" },
  ];

  await Promise.all(
    requiredBranches.map(branch =>
      db.insert(stores).values(branch).onDuplicateKeyUpdate({ set: { name: branch.name } })
    )
  );
}
