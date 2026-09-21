import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";

describe("external TiDB branch creation constraints", () => {
  it("keeps branch names and codes unique while allowing a reusable branch category", async () => {
    const connectionString = process.env.EXTERNAL_DATABASE_URL;
    expect(connectionString).toBeTruthy();

    const url = new URL(connectionString!);
    const connection = await mysql.createConnection({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
      ssl: { rejectUnauthorized: true },
    });
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();

    try {
      const [obsoleteIndex] = await connection.query<Array<{ index_name: string }>>(
        "SELECT INDEX_NAME AS index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'stores' AND index_name = 'stores_type_unique'",
      );
      expect(obsoleteIndex).toHaveLength(0);

      await connection.beginTransaction();
      await connection.execute(
        "INSERT INTO stores (name, code, type, isActive) VALUES (?, ?, 'bookstore', TRUE)",
        [`Branch category check ${suffix}`, `CHK-${suffix}`],
      );
      await connection.rollback();
    } finally {
      await connection.end();
    }
  }, 30_000);
});
