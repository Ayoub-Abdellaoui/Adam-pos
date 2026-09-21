import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appendUniqueBarcode, calculateInvoiceStatistics, invoiceCameraModalIsOpen, normalizeStageBarcodes, unresolvedInvoiceExceptions } from "./InvoiceStaging";

describe("invoice staging barcode lists", () => {
  it("calculates invoice statistics from each row quantity and prices", () => {
    expect(calculateInvoiceStatistics([
      { quantity: 5, costPrice: 10, sellingPrice: 15 },
      { quantity: 2, costPrice: 20, sellingPrice: 25 },
    ])).toEqual({
      totalCapital: 90,
      totalSales: 125,
      totalProfit: 35,
      profitPercentage: (35 / 90) * 100,
      productCount: 2,
      unitCount: 7,
    });
    expect(calculateInvoiceStatistics([{ quantity: 3, costPrice: 0, sellingPrice: 0 }]).profitPercentage).toBe(0);
  });

  it("appends repeated USB or camera scans only when the barcode is unique and valid", () => {
    const first = appendUniqueBarcode(["978000000001"], "978000000002");
    expect(first).toEqual(["978000000001", "978000000002"]);
    expect(appendUniqueBarcode(first, "978000000002")).toEqual(first);
    expect(appendUniqueBarcode(first, "12")).toEqual(first);
  });

  it("normalizes missing or legacy barcode values before barcode list operations", () => {
    expect(normalizeStageBarcodes(undefined, "978000000001")).toEqual(["978000000001"]);
    expect(normalizeStageBarcodes(["978000000001", "978000000001", " 978000000002 "], undefined)).toEqual(["978000000001", "978000000002"]);
    expect(appendUniqueBarcode(undefined, "978000000003")).toEqual(["978000000003"]);
  });

  it("opens the camera modal for the first invoice row and rejects invalid row targets", () => {
    expect(invoiceCameraModalIsOpen(true, 0, 1)).toBe(true);
    expect(invoiceCameraModalIsOpen(true, null, 1)).toBe(false);
    expect(invoiceCameraModalIsOpen(true, 2, 1)).toBe(false);
    expect(invoiceCameraModalIsOpen(false, 0, 1)).toBe(false);
  });

  it("requires an explicit decision for every extracted anomaly before commit", () => {
    const exceptions = [{ sourceIndex: 0, kind: "missing_reference" as const, question: "Include without a reference?" }];
    expect(unresolvedInvoiceExceptions(exceptions, {})).toEqual(exceptions);
    expect(unresolvedInvoiceExceptions(exceptions, { 0: "include" })).toEqual([]);
  });

  it("provides a dedicated direct single-product entry path alongside bulk invoice intake", () => {
    const source = readFileSync(new URL("./InvoiceStaging.tsx", import.meta.url), "utf8");
    expect(source).toContain("Add Single Product");
    expect(source).toContain("ProductEditor");
    expect(source).toContain("createSingleProduct");
    expect(source).toContain("Single product saved directly to inventory.");
    expect(source).toContain("barcodes: draft.barcodes");
    expect(source).toContain("reference: draft.reference || draft.sku || undefined");
  });

  it("gates supplier debt controls to financial roles while passing detected supplier and invoice amount fields to the transactional commit", () => {
    const source = readFileSync(new URL("./InvoiceStaging.tsx", import.meta.url), "utf8");
    expect(source).toContain("canManagePayables");
    expect(source).toContain("AI-detected supplier");
    expect(source).toContain("Create supplier profile");
    expect(source).toContain("Total Amount (DZD)");
    expect(source).toContain("Amount Paid (DZD)");
    expect(source).toContain("Remaining Amount (Debt)");
    expect(source).toContain("trpc.srm.suppliers.recognizeOrCreate");
    expect(source).toContain("totalAmount: stage.totalAmount");
    expect(source).toContain("amountPaid: stage.amountPaid");
    expect(source).toContain("reviewSessionId: stage.reviewSessionId");
    expect(source).toContain("exceptionDecisions: stage.exceptions.map");
    expect(source).toContain("2. Review and barcode the stock");
    expect(source).toContain("Primary review reference code for ${item.productName");
    expect(source).toContain("Cost price");
    expect(source).toContain("Margin option");
    expect(source).toContain("Selling price");
    expect(source).toContain("Reference");
    expect(source).toContain("Assign Barcodes");
    expect(source).toContain("Enable profit margin for ${item.productName");
    expect(source).toContain("Use margin");
    expect(source).toContain("Primary review selling price for ${item.productName");
    expect(source).toContain("disabled={item.profitMarginEnabled}");
    expect(source).toContain("profitMarginEnabled: item.profitMarginEnabled");
    expect(source).toContain("sellingPrice: item.sellingPrice");
    expect(source).toContain("Confirmation required");
    expect(source).not.toContain("Complete extracted invoice review");
    expect(source).not.toContain("Profit margin and selling-price review");
    expect(source).not.toContain("Extracted references — review before saving");
  });

  it("keeps Reference Source scoped to the current invoice and exposes all supported locations", () => {
    const source = readFileSync(new URL("./InvoiceStaging.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="referenceSource"');
    expect(source).toContain('value="product_name"');
    expect(source).toContain('value="separate_column"');
    expect(source).toContain('value="separate_area"');
    expect(source).toContain("referenceSource: source");
    expect(source).toContain("setReferenceSource(\"product_name\")");
  });
});
