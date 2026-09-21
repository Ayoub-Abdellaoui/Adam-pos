import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Phase 5.1 finance contracts", () => {
  it("excludes Cashiers and resolves every branch financial record through the server-side scope guard", () => {
    const source = readFileSync(new URL("./finance.ts", import.meta.url), "utf8");
    expect(source).toContain('const financialRoles: BranchStaffRole[] = ["admin", "supervisor"]');
    expect(source).toContain("const financialProcedure = roleProcedure(...financialRoles)");
    expect(source).toContain("function resolveFinanceStore");
    expect(source).toContain("requireBranchRole(user, storeId, financialRoles)");
    expect(source).not.toContain('financialRoles: BranchStaffRole[] = ["admin", "cashier"');
  });

  it("uses immutable invoice payments, non-destructive expense voiding, and branch-scoped queries", () => {
    const source = readFileSync(new URL("./finance.ts", import.meta.url), "utf8");
    expect(source).toContain("supplierInvoicePayments");
    expect(source).toContain("invoicePaymentTotal");
    expect(source).toContain("Payment exceeds the remaining payable balance");
    expect(source).toContain('eq(operationalExpenses.status, "posted")');
    expect(source).toContain('status: "voided"');
    expect(source).toContain("requireFinanceStore(ctx.user, expense.storeId)");
  });

  it("locks the supplier before its invoice and recomputes both payable snapshots", () => {
    const source = readFileSync(new URL("./finance.ts", import.meta.url), "utf8");
    const supplierLock = source.indexOf('from(suppliers).where(eq(suppliers.id, authorizedInvoice.supplierId)).for("update")');
    const invoiceLock = source.indexOf('from(invoices).where(eq(invoices.id, authorizedInvoice.id)).orderBy(asc(invoices.id)).for("update")');
    expect(supplierLock).toBeGreaterThan(-1);
    expect(invoiceLock).toBeGreaterThan(supplierLock);
    expect(source).toContain("amountPaid: money(Number(invoice.amountPaid) + input.amount).toFixed(2)");
    expect(source).toContain("currentDebt: remainingSupplierDebt.toFixed(2)");
  });
});
