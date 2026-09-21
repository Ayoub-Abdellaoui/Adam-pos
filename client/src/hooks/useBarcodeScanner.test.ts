import { describe, expect, it } from "vitest";
import { BARCODE_SCANNER_MAX_KEY_GAP_MS, isRapidBarcodeInput } from "./useBarcodeScanner";

describe("barcode scanner timing", () => {
  it("recognizes rapid scanner keystrokes without treating ordinary Reference typing as scanner input", () => {
    expect(isRapidBarcodeInput(BARCODE_SCANNER_MAX_KEY_GAP_MS)).toBe(true);
    expect(isRapidBarcodeInput(BARCODE_SCANNER_MAX_KEY_GAP_MS + 1)).toBe(false);
    expect(isRapidBarcodeInput(0)).toBe(false);
  });
});
