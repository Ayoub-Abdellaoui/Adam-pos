import { afterEach, describe, expect, it, vi } from "vitest";

const originalKey = process.env.OCR_SPACE_API_KEY;
const imageDataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.OCR_SPACE_API_KEY;
  else process.env.OCR_SPACE_API_KEY = originalKey;
  vi.resetModules();
});

describe("isolated OCR.space Preview test", () => {
  it("uses Arabic Engine 3 table OCR and never returns the server key", async () => {
    process.env.OCR_SPACE_API_KEY = "test-ocr-space-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      IsErroredOnProcessing: false,
      ProcessingTimeInMilliseconds: "10",
      ParsedResults: [{ ParsedText: "محفظة بي 1149-5-6" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { runOcrSpaceInvoiceTest } = await import("./ocrSpaceTest");

    await expect(runOcrSpaceInvoiceTest(imageDataUrl)).resolves.toMatchObject({
      engine: "3",
      language: "ara",
      tableRecognition: true,
      text: "محفظة بي 1149-5-6",
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.ocr.space/parse/image", expect.objectContaining({ method: "POST", headers: { apikey: "test-ocr-space-key" } }));
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("language")).toBe("ara");
    expect(body.get("OCREngine")).toBe("3");
    expect(body.get("isTable")).toBe("true");
    expect(body.get("file")).toBeInstanceOf(Blob);
  });

  it("fails closed when the server-only key is missing", async () => {
    delete process.env.OCR_SPACE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runOcrSpaceInvoiceTest } = await import("./ocrSpaceTest");

    await expect(runOcrSpaceInvoiceTest(imageDataUrl)).rejects.toThrow("OCR_SPACE_API_KEY is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("structures rows, corrects reversed numeric references, and merges wrapped continuations", async () => {
    const { structureOcrSpaceTable } = await import("./ocrSpaceTest");
    const rows = structureOcrSpaceTable(`| 9250.00 | 1850.00 | 5 | محفظة بي 6-5-1149 |\n| 6000.00 | 2000.00 | 3 | محفظة 4 بياس لوكس |\n| | | | 19-342 |`);
    expect(rows).toEqual([
      { productName: "محفظة بي", reference: "1149-5-6", quantity: 5, costPrice: 1850, totalAmount: 9250 },
      { productName: "محفظة 4 بياس لوكس 19-342", reference: "19-342", quantity: 3, costPrice: 2000, totalAmount: 6000 },
    ]);
  });

  it("ignores non-table invoice headers instead of creating product rows", async () => {
    const { structureOcrSpaceTable } = await import("./ocrSpaceTest");
    expect(structureOcrSpaceTable("Seller: Example Store\nBuyer: Example Customer\nPhone: 0555123456\nInvoice No: 1149-5-6")).toEqual([]);
  });

  it("extracts headerless continuation rows when OCR.space returns tabular columns", async () => {
    const { structureOcrSpaceTable } = await import("./ocrSpaceTest");
    expect(structureOcrSpaceTable("9250.00\t1850.00\t5\tمحفظة بي 6-5-1149\n6000.00\t2000.00\t3\tمحفظة 4 بياس لوكس")).toEqual([
      { productName: "محفظة بي", reference: "1149-5-6", quantity: 5, costPrice: 1850, totalAmount: 9250 },
      { productName: "محفظة 4 بياس لوكس", reference: null, quantity: 3, costPrice: 2000, totalAmount: 6000 },
    ]);
  });

  it("uses the selected separate-column reference source without changing product or numeric fields", async () => {
    const { structureOcrSpaceTable } = await import("./ocrSpaceTest");
    expect(structureOcrSpaceTable("| 9250.00 | 1850.00 | 5 | 1149-5-6 | محفظة بي |", "separate_column")).toEqual([
      { productName: "محفظة بي", reference: "1149-5-6", quantity: 5, costPrice: 1850, totalAmount: 9250 },
    ]);
  });

  it("extracts the reference pattern from the product name and ignores an unrelated numeric field", async () => {
    const { structureOcrSpaceTable } = await import("./ocrSpaceTest");
    const rows = structureOcrSpaceTable("| 07369 | 12.00 | 2 | 24.00 | 0809 MARQUERE TB POCHETTE DE 4 NY 0809 |");
    expect(rows[0]).toMatchObject({
      productName: "0809 MARQUERE TB POCHETTE DE 4",
      reference: "NY 0809",
    });
    expect(rows[0]?.reference).not.toBe("07369");
  });

  it("prioritizes an embedded reference over the sequential five-digit code", async () => {
    const { structureOcrSpaceTable } = await import("./ocrSpaceTest");
    const rows = structureOcrSpaceTable("07369\n0809 MARQUERE TB POCHETTE DE 4 NY 0809\n2\n12,00\n24,00");
    expect(rows).toEqual([{ productName: "0809 MARQUERE TB POCHETTE DE 4", reference: "NY 0809", quantity: 2, costPrice: 12, totalAmount: 24 }]);
    expect(rows[0]?.reference).not.toBe("07369");
  });

  it("handles the uploaded invoice OCR layout where the product code precedes the name and NY is the visible suffix", async () => {
    const { structureOcrSpaceTable } = await import("./ocrSpaceTest");
    expect(structureOcrSpaceTable("07369\n0809 MARQUERE TB POCHETTE DE 4 NY\n24\n162,00\n3 888,00")).toEqual([
      { productName: "0809 MARQUERE TB POCHETTE DE 4", reference: "NY 0809", quantity: 24, costPrice: 162, totalAmount: 3888 },
    ]);
  });

  it("leaves a standalone sequential code blank when no reliable reference is present", async () => {
    const { structureOcrSpaceTable } = await import("./ocrSpaceTest");
    expect(structureOcrSpaceTable("07369\nPLAIN ITEM\n2\n12,00\n24,00")).toEqual([
      { productName: "PLAIN ITEM", reference: null, quantity: 2, costPrice: 12, totalAmount: 24 },
    ]);
  });

  it("keeps a different embedded product-name reference while ignoring its row code", async () => {
    const { structureOcrSpaceTable } = await import("./ocrSpaceTest");
    expect(structureOcrSpaceTable("54123\nPEN SET 3 AB 54123\n4\n5,00\n20,00")).toEqual([
      { productName: "PEN SET 3", reference: "AB 54123", quantity: 4, costPrice: 5, totalAmount: 20 },
    ]);
  });

  it("maps a separate reference area by row order only when every row has one reference", async () => {
    const { structureOcrSpaceTable } = await import("./ocrSpaceTest");
    expect(structureOcrSpaceTable("| 9250.00 | 1850.00 | 5 | محفظة بي |\n| 6000.00 | 2000.00 | 3 | محفظة لوكس |\nReference\n1149-5-6\n19-342", "separate_area")).toEqual([
      { productName: "محفظة بي", reference: "1149-5-6", quantity: 5, costPrice: 1850, totalAmount: 9250 },
      { productName: "محفظة لوكس", reference: "19-342", quantity: 3, costPrice: 2000, totalAmount: 6000 },
    ]);
  });

  it("preserves raw code and designation context without classifying a reference", async () => {
    const { extractRawOcrRows } = await import("./ocrSpaceTest");
    const rows = extractRawOcrRows("07369\n0809 MARQUERE TB POCHETTE DE 4 NY\n24\n162,00\n3 888,00\n05265\nBRISTOL BLANC QUADRILLE 1820\n2\n399,00\n798,00");
    expect(rows).toEqual([
      { sourceIndex: 0, code: "07369", designation: "0809 MARQUERE TB POCHETTE DE 4 NY", quantity: 24, costPrice: 162, totalAmount: 3888 },
      { sourceIndex: 1, code: "05265", designation: "BRISTOL BLANC QUADRILLE 1820", quantity: 2, costPrice: 399, totalAmount: 798 },
    ]);
  });
});
