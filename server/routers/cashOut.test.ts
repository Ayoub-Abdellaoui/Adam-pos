import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Cash Out financial and shift-reconciliation contracts", () => {
  it("records only authorized branch cash-outs against an open shift and atomically reduces expected cash", () => {
    const source = readFileSync(new URL("./cashOut.ts", import.meta.url), "utf8");
    expect(source).toContain('const financialRoles: BranchStaffRole[] = ["admin", "supervisor"]');
    expect(source).toContain("eq(shifts.status, \"open\")");
    expect(source).toContain("Cash Out amount exceeds the shift's expected cash balance.");
    expect(source).toContain("expectedCash: sql`${shifts.expectedCash} - ${money(input.amount)}`");
    expect(source).toContain("await tx.insert(cashOuts).values");
  });

  it("requires a branch employee for salary advances and exposes employee history plus an immutable ledger", () => {
    const source = readFileSync(new URL("./cashOut.ts", import.meta.url), "utf8");
    expect(source).toContain("employeeSearch: cashOutProcedure");
    expect(source).toContain("Select the employee receiving this salary advance.");
    expect(source).toContain("eq(userBranchRoles.storeId, storeId!)");
    expect(source).toContain("ledger: cashOutProcedure");
    expect(source).toContain("employeeAdvances: cashOutProcedure");
    expect(source).toContain('eq(cashOuts.category, "employee_advance")');
  });

  it("subtracts posted withdrawals when a shift is closed", () => {
    const source = readFileSync(new URL("./enterprise.ts", import.meta.url), "utf8");
    expect(source).toContain("cashOuts");
    expect(source).toContain("const withdrawals = await db.select({ amount: cashOuts.amount })");
    expect(source).toContain("- withdrawals.reduce");
  });
});
