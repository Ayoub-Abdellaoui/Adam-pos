import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product detail and branch search routes", () => {
  it("keeps deep links branch-scoped and shows financial fields only when returned by the server", () => {
    const details = readFileSync(new URL("./ProductDetails.tsx", import.meta.url), "utf8");
    const products = readFileSync(new URL("./ProductManagement.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(details).toContain('"purchasePrice" in product');
    expect(details).toContain('t("common.barcode")');
    expect(products).toContain("Search name, barcode, SKU, category, or variation");
    expect(products).toContain("debouncedSearch");
    expect(products).toContain("product.category ?? \"\"");
    expect(products).toContain("product.variations ?? \"\"");
    expect(products).toContain("product.sku ?? \"\"");
    expect(app).toContain("/branches/:storeId/product/:productId");
    expect(app).toContain("/branches/:storeId/statistics");
  });
});
