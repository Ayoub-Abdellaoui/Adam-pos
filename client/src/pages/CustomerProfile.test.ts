import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Customers directory query contract", () => {
  it("keeps the customer-search request within the server-side limit", () => {
    const source = readFileSync(new URL("./CustomerProfile.tsx", import.meta.url), "utf8");

    expect(source).toContain('trpc.enterprise.customers.search.useQuery({ query, limit: 30 })');
    expect(source).not.toContain('trpc.enterprise.customers.search.useQuery({ query, limit: 100 })');
  });

  it("renders secure payment and manual-debt actions with a live transaction ledger", () => {
    const source = readFileSync(new URL("./CustomerProfile.tsx", import.meta.url), "utf8");
    expect(source).toContain("recordDebtTransaction.useMutation");
    expect(source).toContain('openTransaction("payment")');
    expect(source).toContain('openTransaction("manual_debt")');
    expect(source).toContain("utils.enterprise.customers.profile.invalidate");
    expect(source).toContain("profile.data.transactions");
    expect(source).toContain('t("customerDebt.makePayment")');
    expect(source).toContain('t("customerDebt.addDebt")');
  });

  it("adds compact invoice detail and return actions with quantity selection in credit invoice history", () => {
    const source = readFileSync(new URL("./CustomerProfile.tsx", import.meta.url), "utf8");
    expect(source).toContain("creditInvoiceDetail.useQuery");
    expect(source).toContain("processCreditInvoiceReturn.useMutation");
    expect(source).toContain('openInvoiceAction(invoice.id, "view")');
    expect(source).toContain('openInvoiceAction(invoice.id, "return")');
    expect(source).toContain("returnableQuantity");
    expect(source).toContain('t("customerDebt.confirmReturn")');
  });
});
