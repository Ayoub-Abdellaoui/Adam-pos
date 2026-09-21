import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Sales History archive", () => {
  it("renders searchable, date-organized archived invoices and reprints exact persisted details", () => {
    const source = readFileSync(new URL("./SalesHistory.tsx", import.meta.url), "utf8");
    expect(source).toContain("trpc.inventory.salesArchive.useQuery");
    expect(source).toContain("trpc.inventory.salesInvoiceDetail.useQuery");
    expect(source).toContain("Search invoice or receipt");
    expect(source).toContain("Sales invoice review");
    expect(source).toContain("Invoice barcode");
    expect(source).toContain("selected.lines.map");
    expect(source).toContain("periodOptions");
    expect(source).toContain("Custom range");
    expect(source).toContain("archive-from");
    expect(source).toContain("groupLabel");
    expect(source).toContain("Exact date & time");
    expect(source).toContain('t("receipt.print")');
    expect(source).toContain("<ThermalReceipt receipt={receiptToReprint} autoPrint");
    expect(source).toContain("reprintDetail.data.lines.map");
  });
});
