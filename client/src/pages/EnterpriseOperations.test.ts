import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Enterprise Operations workspace", () => {
  it("exposes only the intended branch, operations, and customer controls", () => {
    const source = readFileSync(new URL("./EnterpriseOperations.tsx", import.meta.url), "utf8");
    expect(source).toContain('t("common.globalBranchAdministration")');
    expect(source).toContain('t("common.cashierShifts")');
    expect(source).toContain('t("common.interBranchTransfer")');
    expect(source).toContain('t("common.unifiedCustomerRegistry")');
    expect(source).toContain("trpc.enterprise.transfers.execute");
    expect(source).toContain("trpc.enterprise.shifts.open");
    expect(source).toContain("trpc.enterprise.customers.upsert");
    expect(source).toContain("initialStoreId");
    expect(source).toContain("activeBranchRole");
    expect(source).toContain("trpc.enterprise.transfers.history");
  });
});
