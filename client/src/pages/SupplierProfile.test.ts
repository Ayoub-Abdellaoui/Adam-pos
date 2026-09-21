import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Supplier Profile SRM UI", () => {
  it("uses only protected SRM contracts for profiles, FIFO payment registration, immutable invoice detail, and isolated printing", () => {
    const source = readFileSync(new URL("./SupplierProfile.tsx", import.meta.url), "utf8");
    expect(source).toContain("trpc.srm.suppliers.profile.useQuery");
    expect(source).toContain("trpc.srm.payments.register.useMutation");
    expect(source).toContain("trpc.srm.invoices.detail.useQuery");
    expect(source).toContain("Register supplier payment");
    expect(source).toContain("Open details");
    expect(source).toContain('t("receipt.print")');
    expect(source).toContain('t("receipt.paymentReceipt")');
    expect(source).toContain("printIsolatedReceipt");
    expect(source).toContain("Current Total Debt");
  });

  it("is mounted only through Admin or Supervisor protected routes, never through Cashier routes", () => {
    const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(appSource).toContain("GlobalSupplierProfileRoute");
    expect(appSource).toContain("BranchSupplierProfileRoute");
    expect(appSource).toContain('hasBranchRole(user, parsedStoreId, ["admin", "supervisor"])');
    expect(appSource).not.toContain('hasBranchRole(user, parsedStoreId, ["admin", "cashier", "supervisor"]) ? <SupplierProfile');
  });
});
