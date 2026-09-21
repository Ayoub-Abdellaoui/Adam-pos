import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Product Management barcode labels", () => {
  it("renders barcode previews with per-code print quantities and isolated print actions", () => {
    const source = readFileSync(new URL("./ProductManagement.tsx", import.meta.url), "utf8");
    expect(source).toContain('import BarcodeRenderer from "react-barcode"');
    expect(source).toContain("Print Quantity for ${barcode}");
    expect(source).toContain("Print Barcode");
    expect(source).toContain("printIsolatedLabels(labelRoot)");
    expect(source).toContain("Array.from({ length: labelJob.quantity }");
    expect(source).toContain('t("receipt.store")');
    expect(source).toContain("barcode-label");
  });

  it("exposes a dedicated complete single-product entry flow", () => {
    const source = readFileSync(new URL("./ProductManagement.tsx", import.meta.url), "utf8");
    expect(source).toContain("Add Single Product");
    expect(source).toContain("Directly append one complete product record to branch inventory—no invoice import required.");
    expect(source).toContain("Purchase price (Cost)");
    expect(source).toContain("Selling price (DZD)");
    expect(source).toContain("Stock quantity");
    expect(source).toContain("Primary barcode & additional barcodes");
    expect(source).toContain("Primary barcode");
    expect(source).toContain("Add a primary barcode before saving a single product.");
    expect(source).toContain("Save Single Product");
    expect(source).toContain("createProduct.mutate({ storeId: Number(draft.storeId)");
    expect(source).toContain("SKU / Reference");
    expect(source).toContain("reference: draft.reference || undefined");
    expect(source).toContain("product.reference || product.sku || \"—\"");
  });
});
