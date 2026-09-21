import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("enterprise branch tenancy contracts", () => {
  it("keeps branch lifecycle, shared customers, shifts, and transfers behind role-scoped procedures", () => {
    const source = readFileSync(new URL("./enterprise.ts", import.meta.url), "utf8");
    expect(source).toContain("function scopedStoreId");
    expect(source).toContain("requireBranchRole(user, storeId, roles)");
    expect(source).toContain("userBranchRoles");
    expect(source).toContain("branches: router");
    expect(source).toContain("customers: router");
    expect(source).toContain("shifts: router");
    expect(source).toContain("transfers: router");
    expect(source).toContain("return db.transaction");
    expect(source).toContain("stockTransferLines");
    expect(source).toContain("eq(shifts.status, \"open\")");
  });

  it("records customer payments and manual debt additions through an immutable, role-scoped ledger", () => {
    const source = readFileSync(new URL("./enterprise.ts", import.meta.url), "utf8");
    const schema = readFileSync(new URL("../../drizzle/schema.ts", import.meta.url), "utf8");
    expect(source).toContain("recordDebtTransaction: roleProcedure(\"admin\", \"cashier\", \"supervisor\")");
    expect(source).toContain("customerDebtTransactions");
    expect(source).toContain("Payment exceeds the customer's current debt.");
    expect(source).toContain("transactionType: input.transactionType");
    expect(schema).toContain('"customer_debt_transactions"');
    expect(schema).toContain('mysqlEnum("customer_debt_transaction_type", ["payment", "manual_debt", "return_credit"])');
  });

  it("supports authorized credit invoice detail and return processing with stock and debt reconciliation", () => {
    const source = readFileSync(new URL("./enterprise.ts", import.meta.url), "utf8");
    expect(source).toContain('creditInvoiceDetail: roleProcedure("admin", "cashier", "supervisor")');
    expect(source).toContain('processCreditInvoiceReturn: roleProcedure("admin", "supervisor")');
    expect(source).toContain('transactionType: "return_credit"');
    expect(source).toContain("quantityOnHand: sql`${products.quantityOnHand} + ${line.quantity}`");
    expect(source).toContain("debtReduction");
  });

  it("locks the credit-sale parent before returnable reads and locks customer debt before its snapshot", () => {
    const source = readFileSync(new URL("./enterprise.ts", import.meta.url), "utf8");
    const saleLock = source.indexOf('eq(sales.paymentMethod, "credit"))).for("update")');
    const returnRead = source.indexOf("const priorReturns = await tx.select", saleLock);
    expect(saleLock).toBeGreaterThan(-1);
    expect(returnRead).toBeGreaterThan(saleLock);
    expect(source).toContain("where(eq(customers.id, sale.customerId)).for(\"update\")");
  });

  it("restricts enterprise statistics to Super Admins and uses the selected sales and return windows", () => {
    const source = readFileSync(new URL("./enterprise.ts", import.meta.url), "utf8");
    expect(source).toContain("globalStatistics: adminProcedure.input(globalStatisticsInput)");
    expect(source).toContain("gte(sales.createdAt, input.from)");
    expect(source).toContain("lte(sales.createdAt, input.to)");
    expect(source).toContain("gte(saleReturns.createdAt, input.from)");
    expect(source).toContain("calculateGlobalStatistics");
    expect(source).toContain("operationalExpenses");
    expect(source).toContain('eq(operationalExpenses.status, "posted")');
    expect(source).toContain("expenses: expenseRows");
  });

  it("permits reusable branch categories while preserving friendly duplicate name and code protection", () => {
    const source = readFileSync(new URL("./enterprise.ts", import.meta.url), "utf8");
    const schema = readFileSync(new URL("../../drizzle/schema.ts", import.meta.url), "utf8");

    expect(source).toContain("or(eq(stores.name, input.name), eq(stores.code, input.code))");
    expect(source).toContain("A branch with this name or code already exists.");
    expect(source).not.toContain("Branch name, code, and type must each be unique.");
    expect(schema).toContain('type: mysqlEnum("type", ["cosmetics", "bookstore", "clothing", "gifts", "other"]).notNull(),');
    expect(schema).not.toContain('mysqlEnum("type", ["cosmetics", "bookstore", "clothing", "gifts", "other"]).notNull().unique()');
  });
});
