import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "invoice-key", url: "invoice-url" }),
}));

describe("OCR.space provider errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("includes a sanitized provider message for non-2xx responses", async () => {
    process.env.OCR_SPACE_API_KEY = "secret-ocr-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ErrorMessage: "Invalid API key secret-ocr-key" }), { status: 403 })));
    const { analyzeInvoiceWithOcrSpace } = await import("./ocrSpaceVision");
    const dataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";

    await expect(analyzeInvoiceWithOcrSpace(dataUrl)).rejects.toThrow("OCR.space invoice analysis failed (403): Invalid API key [redacted]");
    await expect(analyzeInvoiceWithOcrSpace(dataUrl)).rejects.not.toThrow("secret-ocr-key");
  });
});
