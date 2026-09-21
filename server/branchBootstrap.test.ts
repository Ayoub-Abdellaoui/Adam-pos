import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";

import { ensureRetailBranches } from "./db";

describe("external TiDB branch bootstrap", () => {
  it("idempotently restores the required active operational branches", async () => {
    const connectionString = process.env.EXTERNAL_DATABASE_URL;
    expect(connectionString).toBeTruthy();

    await ensureRetailBranches();

    const url = new URL(connectionString!);
    const connection = await mysql.createConnection({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
      ssl: { rejectUnauthorized: true },
    });

    try {
      const [rows] = await connection.query<Array<{ code: string; type: string; is_active: number }>>(
        "SELECT code, type, isActive AS is_active FROM stores WHERE code IN ('COS', 'BOOK', 'CLOTH') ORDER BY code",
      );

      expect(rows).toEqual([
        { code: "BOOK", type: "bookstore", is_active: 1 },
        { code: "CLOTH", type: "clothing", is_active: 1 },
        { code: "COS", type: "cosmetics", is_active: 1 },
      ]);
    } finally {
      await connection.end();
    }
  }, 30_000);
});
