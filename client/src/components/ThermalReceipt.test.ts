import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ThermalReceipt isolated printing", () => {
  it("uses delayed isolated iframe printing and supports one-time auto-print", () => {
    const source = readFileSync(new URL("./ThermalReceipt.tsx", import.meta.url), "utf8");
    expect(source).toContain("printIsolatedReceipt(receiptRef.current)");
    expect(source).toContain("nativePrintPaintDelayMs = 320");
    expect(source).toContain("window.requestAnimationFrame");
    expect(source).toContain("autoPrintTriggered");
    expect(source).toContain("autoPrint = false");
    expect(source).toContain('t("receipt.opening")');
    expect(source).not.toContain('printThermal("receipt")');
    expect(source).not.toContain("URL.createObjectURL");
    expect(source).toContain("<table className=");
    expect(source).toContain("scope=\"col\"");
    expect(source).toContain('t("receipt.barcode")');
    expect(source).toContain("max-w-[80mm]");
    expect(source).toContain('t("receipt.store")');
  });
});
