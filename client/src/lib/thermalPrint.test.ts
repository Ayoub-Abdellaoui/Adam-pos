/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { printIsolatedLabels, printIsolatedReceipt } from "./thermalPrint";

describe("isolated receipt printing", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.querySelectorAll("iframe[aria-hidden='true']").forEach(frame => frame.remove());
  });

  it("writes only the receipt into a dedicated 80 mm iframe and prints that frame before cleanup", async () => {
    vi.useFakeTimers();
    const receipt = document.createElement("article");
    receipt.className = "print-receipt";
    receipt.innerHTML = "<table><tbody><tr><td>Notebook</td></tr></tbody></table><svg><rect width='2' height='38'></rect></svg>";
    const realCreateElement = document.createElement.bind(document);
    const frame = realCreateElement("iframe");
    const write = vi.fn();
    const framePrint = vi.fn();
    Object.defineProperty(frame, "contentDocument", { configurable: true, value: { open: vi.fn(), write, close: vi.fn() } });
    Object.defineProperty(frame, "contentWindow", { configurable: true, value: { addEventListener: vi.fn(), focus: vi.fn(), print: framePrint } });
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => tagName === "iframe" ? frame : realCreateElement(tagName));

    const result = printIsolatedReceipt(receipt);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toContain(receipt.outerHTML);
    expect(write.mock.calls[0]?.[0]).toContain("@page { size: 80mm auto");
    expect(write.mock.calls[0]?.[0]).not.toContain("#root");
    expect(framePrint).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(180);
    await result;
    expect(framePrint).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_500);
    expect(document.body.contains(frame)).toBe(false);
  });

  it("writes every requested 50 mm × 30 mm label into its own isolated print document", async () => {
    vi.useFakeTimers();
    const labels = document.createElement("div");
    labels.className = "barcode-labels";
    labels.innerHTML = Array.from({ length: 10 }, (_, index) => `<article class="barcode-label"><p>محلات آدم</p><p>Notebook ${index + 1}</p><svg><rect width="2" height="38"></rect></svg><p>123456789012</p></article>`).join("");
    const realCreateElement = document.createElement.bind(document);
    const frame = realCreateElement("iframe");
    const write = vi.fn();
    const framePrint = vi.fn();
    Object.defineProperty(frame, "contentDocument", { configurable: true, value: { open: vi.fn(), write, close: vi.fn() } });
    Object.defineProperty(frame, "contentWindow", { configurable: true, value: { addEventListener: vi.fn(), focus: vi.fn(), print: framePrint } });
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => tagName === "iframe" ? frame : realCreateElement(tagName));

    const result = printIsolatedLabels(labels);
    const documentMarkup = String(write.mock.calls[0]?.[0]);
    expect(documentMarkup).toContain("@page { size: 50mm 30mm");
    expect(documentMarkup.match(/class="barcode-label"/g)).toHaveLength(10);
    expect(documentMarkup).toContain("محلات آدم");
    expect(documentMarkup).not.toContain("#root");
    await vi.advanceTimersByTimeAsync(180);
    await result;
    expect(framePrint).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(document.body.contains(frame)).toBe(false);
  });
});
