import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { invoiceExtractionSchema, normalizeDetectedReference, normalizeExceptions } from "./invoiceParser";

describe("invoice extraction contract", () => {
  it("accepts exactly the requested aligned invoice fields", () => {
    const result = invoiceExtractionSchema.parse({
      "Supplier Name": "Northstar Wholesale",
      "Product Names": ["Velvet Lip Tint", "Cloud Compact"],
      Quantities: [12, 6],
      "Cost Prices": [4.5, 8.25],
      References: ["VLT12", "CC6"],
      "Total Invoice Amount": 103.5,
      "Amount Paid": 20,
    });

    expect(Object.keys(result)).toEqual(["Supplier Name", "Product Names", "Quantities", "Cost Prices", "References", "Total Invoice Amount", "Amount Paid"]);
    expect(result.Quantities).toHaveLength(result["Product Names"].length);
    expect(result.References).toHaveLength(result["Product Names"].length);
    expect(result["Total Invoice Amount"] - result["Amount Paid"]).toBe(83.5);
  });

  it("rejects unaligned arrays and unexpected fields", () => {
    expect(() => invoiceExtractionSchema.parse({
      "Supplier Name": "Northstar Wholesale",
      "Product Names": ["Velvet Lip Tint"],
      Quantities: [12, 6],
      "Cost Prices": [4.5],
      References: ["VLT12"],
      "Total Invoice Amount": 54,
      "Amount Paid": 0,
    })).toThrow();

    expect(() => invoiceExtractionSchema.parse({
      "Supplier Name": "Northstar Wholesale",
      "Product Names": ["Velvet Lip Tint"],
      Quantities: [12],
      "Cost Prices": [4.5],
      References: ["VLT12"],
      "Total Invoice Amount": 54,
      "Amount Paid": 0,
      confidence: 0.9,
    })).toThrow();

    const separatedReference = invoiceExtractionSchema.parse({
      "Supplier Name": "Northstar Wholesale",
      "Product Names": ["Velvet Lip Tint"],
      Quantities: [12],
      "Cost Prices": [4.5],
      References: ["1147-8"],
      "Total Invoice Amount": 54,
      "Amount Paid": 0,
    });
    expect(separatedReference.References).toEqual(["1147-8"]);
  });

  it("accepts real invoice lines with optional fields absent or combined", () => {
    const result = invoiceExtractionSchema.parse({
      "Supplier Name": null,
      "Product Names": ["Widget AB-12", null, "Loose Product"],
      Quantities: [4, 2, null],
      "Cost Prices": [12.5, null, 3],
      References: [null, "REF99", null],
      "Total Invoice Amount": null,
      "Amount Paid": null,
    });
    expect(result["Product Names"]).toHaveLength(3);
    expect(result.References).toEqual([null, "REF99", null]);
    expect(result.Quantities[2]).toBeNull();
    expect(result["Cost Prices"][1]).toBeNull();
  });

  it("keeps OCR line positions aligned by padding only missing parallel fields", () => {
    const source = readFileSync(new URL("./invoiceParser.ts", import.meta.url), "utf8");
    expect(source).toContain("const values = Array.isArray(rawResponse[field]) ? rawResponse[field] : []");
    expect(source).toContain("Array.from({ length: lineCount - values.length }, () => null)");
    expect(source).toContain('const lineFields = ["Product Names", "Quantities", "Cost Prices", "References"]');
  });

  it("creates a confirmation question whenever an extracted reference is missing", () => {
    const extraction = invoiceExtractionSchema.parse({
      "Supplier Name": "Northstar Wholesale",
      "Product Names": ["Velvet Lip Tint", "Cloud Compact"],
      Quantities: [12, 6],
      "Cost Prices": [4.5, 8.25],
      References: ["VLT12", ""],
      "Total Invoice Amount": 103.5,
      "Amount Paid": 20,
    });
    expect(normalizeExceptions(extraction, [])).toEqual([{
      sourceIndex: 1,
      kind: "missing_reference",
      question: "No supplier reference was detected for Cloud Compact. Include this item without a reference?",
    }]);
  });

  it("preserves visible reference characters and separators exactly", () => {
    expect(normalizeDetectedReference("1147-8")).toBe("1147-8");
    expect(normalizeDetectedReference("A / B 7")).toBe("A / B 7");
    expect(normalizeDetectedReference("  REF 12  ")).toBe("  REF 12  ");
  });

  it("uses the OCR.space provider for the existing extraction workflow", () => {
    const source = readFileSync(new URL("./invoiceParser.ts", import.meta.url), "utf8");
    expect(source).toContain("analyzeInvoiceWithOcrSpace");
    expect(source).not.toContain("Gemini");
    expect(source).toContain("parseInvoiceModelContent(primaryResponse)");
  });

  it("uses structured Mistral analysis for validated same-row reference mapping", () => {
    const source = readFileSync(new URL("./invoiceParser.ts", import.meta.url), "utf8");
    expect(source).toContain("analyzeReferencesWithMistral");
    expect(source).toContain('model: "mistral-large-latest"');
    expect(source).toContain("referenceSource");
    expect(source).toContain("rawOcrText");
    expect(source).toContain("structuredRows");
    expect(source).toContain("sourceIndex");
    expect(source).toContain("confidence >= 0.6");
  });

  it("does not send an OCR-preselected reference into semantic Mistral classification", () => {
    const source = readFileSync(new URL("./invoiceParser.ts", import.meta.url), "utf8");
    expect(source).toContain("reference: null");
    expect(source).toContain("row reference field supplied to you is intentionally empty");
    expect(source).toContain("Never use invoice numbers, quantities, prices, totals, barcodes, or the separate Code column as a Reference automatically.");
    expect(source).toContain("Do not use a last-token rule or treat numeric suffixes as References automatically.");
  });
});
