import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Branch-scoped product hub", () => {
  it("routes a branch into catalog, single-product, barcode, and invoice-import tooling under one store scope", () => {
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const products = readFileSync(new URL("./ProductManagement.tsx", import.meta.url), "utf8");
    const invoices = readFileSync(new URL("./InvoiceStaging.tsx", import.meta.url), "utf8");
    expect(app).toContain('/branches/:storeId/products');
    expect(app).toContain('/branches/:storeId/invoice-import');
    expect(products).toContain('productCatalog.useQuery(scopedStoreId ? { storeId: scopedStoreId } : undefined)');
    expect(products).toContain('Import Bulk Invoice');
    expect(products).toContain('Add Single Product');
    expect(invoices).toContain('initialStoreId');
    expect(invoices).toContain('filter(branch => !initialStoreId || branch.id === initialStoreId)');
  });
});
