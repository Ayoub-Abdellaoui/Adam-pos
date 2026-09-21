import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Cash Out management surfaces", () => {
  it("exposes the shared Cash Out form from POS and the Admin dashboard", () => {
    const pos = readFileSync(new URL("./CashierPOS.tsx", import.meta.url), "utf8");
    const dashboard = readFileSync(new URL("./AdminBranchLanding.tsx", import.meta.url), "utf8");
    expect(pos).toContain("<CashOutDialog");
    expect(pos).toContain("canRecordCashOut");
    expect(dashboard).toContain('t("cashOut.drawerControls")');
    expect(dashboard).toContain("<CashOutDialog");
  });

  it("provides a chronological ledger and employee profile advances tab", () => {
    const source = readFileSync(new URL("./CashOutManagement.tsx", import.meta.url), "utf8");
    expect(source).toContain("Expenses & Withdrawals Ledger");
    expect(source).toContain("EmployeeAdvanceProfileDialog");
    expect(source).toContain("Advances History");
    expect(source).toContain("trpc.cashOut.ledger.useQuery");
    expect(source).toContain("trpc.cashOut.employeeAdvances.useQuery");
  });

  it("registers protected global and branch Cash Out routes", () => {
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const sidebar = readFileSync(new URL("../components/DashboardLayout.tsx", import.meta.url), "utf8");
    expect(app).toContain("/global/cash-out");
    expect(app).toContain("/branches/:storeId/cash-out");
    expect(app).toContain("hasBranchRole(user, parsedStoreId, [\"admin\", \"supervisor\"]) ? <CashOutManagement");
    expect(sidebar).toContain("/global/cash-out");
    expect(sidebar).toContain("/branches/${branchId}/cash-out");
  });
});
