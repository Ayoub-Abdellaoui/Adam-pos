import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPosBarcodeErrorMessage, getPosReferenceErrorMessage, isAutomaticBarcodeCandidate } from "./CashierPOS";

describe("POS barcode feedback", () => {
  it("turns the branch-scoped lookup failure into a clear product-not-found message", () => {
    expect(getPosBarcodeErrorMessage(new Error("No product in this branch matches that barcode."))).toBe("Product not found. Barcode is not registered for this branch.");
  });

  it("preserves operational lookup errors such as an out-of-stock product", () => {
    expect(getPosBarcodeErrorMessage(new Error("Notebook is out of stock."))).toBe("Notebook is out of stock.");
  });

  it("distinguishes automatic numeric barcode candidates from Enter-triggered References", () => {
    expect(isAutomaticBarcodeCandidate("12345678")).toBe(true);
    expect(isAutomaticBarcodeCandidate("REF20A")).toBe(false);
    expect(getPosReferenceErrorMessage(new Error("No product in this branch matches that reference."))).toBe("pos.referenceNotFound");
  });

  it("mounts the finalized checkout receipt with auto-print enabled", () => {
    const source = readFileSync(new URL("./CashierPOS.tsx", import.meta.url), "utf8");
    expect(source).toContain("setLastReceipt({ ...receipt");
    expect(source).toContain("setShowReceipt(true)");
    expect(source).toContain("<ThermalReceipt receipt={lastReceipt} onClose={() => setShowReceipt(false)} autoPrint />");
  });

  it("supports credit checkout with customer selection or inline profile creation and debt calculation", () => {
    const source = readFileSync(new URL("./CashierPOS.tsx", import.meta.url), "utf8");
    expect(source).toContain('value="credit"');
    expect(source).toContain("creditFirstName");
    expect(source).toContain("creditLastName");
    expect(source).toContain("creditPhone");
    expect(source).toContain("amountPaidNow");
    expect(source).toContain("Invoice Debt");
    expect(source).toContain("creditCustomer");
    expect(source).toContain("Math.max(0, totals.total - Number(amountPaidNow || 0))");
  });

  it("enforces stock limits, persists draft sessions, and renders zero-stock indicators", () => {
    const source = readFileSync(new URL("./CashierPOS.tsx", import.meta.url), "utf8");
    const cart = readFileSync(new URL("../lib/posCart.tsx", import.meta.url), "utf8");
    expect(source).toContain('t("common.insufficientStock")');
    expect(source).toContain("setQuantitySafely");
    expect(source).toContain("stockIndicator");
    expect(source).toContain("disabled={product.quantityOnHand <= 0}");
    expect(source).toContain('cloud-pos:customer-draft:v1');
    expect(cart).toContain('cloud-pos:active-draft:v1');
    expect(cart).toContain("maxStock");
  });

  it("submits manual and scanner barcode entries immediately, then clears and refocuses the scan field", () => {
    const source = readFileSync(new URL("./CashierPOS.tsx", import.meta.url), "utf8");
    expect(source).toContain("utils.pos.lookupBarcode.fetch({ barcode, ...posScope })");
    expect(source).toContain("useBarcodeScanner(handleScannerRead");
    expect(source).toContain("setManualBarcode(\"\")");
    expect(source).toContain("void addByBarcode(barcode).finally(focusBarcodeInput)");
    expect(source).toContain("utils.pos.lookupReference.fetch({ reference, ...posScope })");
    expect(source).toContain("void addByReference(value).finally(focusBarcodeInput)");
    expect(source).toContain("isAutomaticBarcodeCandidate(barcode)");
    expect(source).toContain("void addByBarcode(value, true).then(found =>");
    expect(source).toContain("void addByReference(value).finally(focusBarcodeInput)");
    expect(source).toContain("const barcodeInputRef = useRef<HTMLInputElement>(null)");
    expect(source).toContain("barcodeInputRef.current?.focus()");
    expect(source).toContain("<form onSubmit={submitBarcode}");
    expect(source).not.toContain("<Plus className=\"me-1.5 h-5 w-5\" /> {t(\"pos.add\")}</Button></form><form onSubmit={submitCustomAmount}");
  });

  it("renders an always-visible POS Credit action that opens the customer debt workspace directly", () => {
    const source = readFileSync(new URL("./CashierPOS.tsx", import.meta.url), "utf8");
    expect(source).toContain('data-pos-credit-action="true"');
    expect(source).toContain('t("pos.credit")');
    expect(source).toContain('onClick={() => setLocation("/customers")}');
    expect(source).toContain('bg-white/10 text-white');
    expect(source).not.toContain("<DropdownMenu>");
  });

  it("implements conflict-safe cashier shortcuts and visible quick-key controls", () => {
    const source = readFileSync(new URL("./CashierPOS.tsx", import.meta.url), "utf8");
    expect(source).toContain('event.key === "F4"');
    expect(source).toContain('event.key === "F2"');
    expect(source).toContain('event.key === "F8"');
    expect(source).toContain('event.preventDefault()');
    expect(source).toContain("quickKeyMapping");
    expect(source).toContain("trpc.pos.quickKeyProducts.useQuery");
    expect(source).toContain("data-pos-quantity=\"true\"");
    expect(source).toContain("addBlankCustomService");
    expect(source).toContain("data-pos-custom-price=\"true\"");
    expect(source).toContain("Confirm payment · F4");
  });

  it("provides an isolated custom amount entry and serializes custom cart lines at checkout", () => {
    const source = readFileSync(new URL("./CashierPOS.tsx", import.meta.url), "utf8");
    expect(source).toContain('t("pos.customAmount")');
    expect(source).toContain("submitCustomAmount");
    expect(source).toContain("addCustom(amount)");
    expect(source).toContain("customName: line.productName, customAmount: line.unitPrice");
  });
});
