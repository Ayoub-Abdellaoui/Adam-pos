import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";

describe("external TiDB database connection", () => {
  it("connects with the managed EXTERNAL_DATABASE_URL and answers a lightweight query", async () => {
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

    try {
      const [rows] = await connection.query<Array<{ connection_test: string | number; database_name: string }>>(
        "SELECT 1 AS connection_test, DATABASE() AS database_name",
      );
      expect(String(rows[0]?.connection_test)).toBe("1");
      expect(rows[0]?.database_name).toBe("adam_pos");

      const [tableRows] = await connection.query<Array<{ table_name: string }>>(
        "SELECT TABLE_NAME AS table_name FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE()",
      );
      const tableNames = new Set(tableRows.map(row => row.table_name));
      for (const requiredTable of ["users", "stores", "products", "sales", "customers", "customer_debt_transactions", "shifts", "cash_outs", "invoices", "supplier_invoice_lines", "invoice_review_sessions", "invoice_exception_decisions"]) {
        expect(tableNames.has(requiredTable)).toBe(true);
      }

      const [customerDebtType] = await connection.query<Array<{ column_type: string }>>(
        "SELECT COLUMN_TYPE AS column_type FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_debt_transactions' AND COLUMN_NAME = 'customer_debt_transaction_type'",
      );
      expect(customerDebtType[0]?.column_type).toContain("return_credit");

      const [referenceColumns] = await connection.query<Array<{ table_name: string; column_name: string }>>(
        "SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'products' AND COLUMN_NAME IN ('reference', 'profitMarginPercent', 'profitMarginEnabled')) OR (TABLE_NAME = 'supplier_invoice_lines' AND COLUMN_NAME IN ('reference', 'sellingPrice', 'profitMarginPercent', 'profitMarginEnabled')) OR (TABLE_NAME = 'invoices' AND COLUMN_NAME = 'extractionPayload'))",
      );
      expect(new Set(referenceColumns.map(column => `${column.table_name}.${column.column_name}`))).toEqual(new Set(["products.reference", "products.profitMarginPercent", "products.profitMarginEnabled", "supplier_invoice_lines.reference", "supplier_invoice_lines.sellingPrice", "supplier_invoice_lines.profitMarginPercent", "supplier_invoice_lines.profitMarginEnabled", "invoices.extractionPayload"]));
    } finally {
      await connection.end();
    }
  }, 30_000);
});
