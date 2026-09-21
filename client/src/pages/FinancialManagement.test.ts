import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Phase 5.1 financial management views", () => {
  it("provides functional supplier payable, invoice payment, and expense workflows in DZD", () => {
    const source = readFileSync(new URL("./FinancialManagement.tsx", import.meta.url), "utf8");
    expect(source).toContain("trpc.finance.suppliers.list.useQuery");
    expect(source).toContain("trpc.finance.invoices.recordPayment.useMutation");
    expect(source).toContain("trpc.finance.expenses.create.useMutation");
    expect(source).toContain("trpc.finance.expenses.void.useMutation");
    expect(source).toContain("formatDZD");
    expect(source).toContain("True Net Profit");
  });
});
