import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Adam POS data management controls", () => {
  it("exposes guarded single and bulk product deletion with refreshable selection", () => {
    const page = readFileSync(new URL("./ProductManagement.tsx", import.meta.url), "utf8");
    const router = readFileSync(new URL("../../../server/routers/inventory.ts", import.meta.url), "utf8");
    expect(page).toContain("trpc.inventory.deleteProducts.useMutation");
    expect(page).toContain("selectedProductIds");
    expect(page).toContain("Delete selected");
    expect(router).toContain("deleteProducts:");
    expect(router).toContain("Products with stock, invoice, or sales history cannot be deleted");
  });

  it("exposes invoice and invoice-line reversal plus supplier balance deduction", () => {
    const page = readFileSync(new URL("./FinancialManagement.tsx", import.meta.url), "utf8");
    const router = readFileSync(new URL("../../../server/routers/finance.ts", import.meta.url), "utf8");
    expect(page).toContain("trpc.finance.invoices.delete.useMutation");
    expect(page).toContain("trpc.finance.invoices.deleteLine.useMutation");
    expect(page).toContain("trpc.finance.suppliers.deductBalance.useMutation");
    expect(router).toContain("deleteLine:");
    expect(router).toContain("delete:");
    expect(router).toContain("deductBalance:");
    expect(router).toContain("quantityOnHand: sql");
    expect(router).toContain("currentDebt");
  });
});
