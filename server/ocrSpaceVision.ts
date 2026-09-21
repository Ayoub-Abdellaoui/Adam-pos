import { ENV } from "./_core/env";
import { ReferenceSource, structureOcrSpaceTable } from "./ocrSpaceTest";

const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";
const MAX_INVOICE_BYTES = 8 * 1024 * 1024;

type InvoiceDataUrl = { mimeType: string; bytes: Buffer };

function decodeDataUrl(dataUrl: string): InvoiceDataUrl {
  const match = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw new Error("OCR.space invoice analysis requires a valid invoice data URL.");
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length || bytes.length > MAX_INVOICE_BYTES) throw new Error("Invoice files must be greater than 0 bytes and no larger than 8 MB.");
  return { mimeType: match[1], bytes };
}

function extensionFor(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/jpeg") return "jpg";
  return mimeType.split("/")[1];
}

function normalizeMarkdownTable(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map(line => {
      const match = /^\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*$/.exec(line);
      return match ? `| ${match[1].trim()} | ${match[2].trim()} | ${match[3].trim()} | ${match[4].trim()} |` : line;
    })
    .join("\n");
}

export async function analyzeInvoiceWithOcrSpace(dataUrl: string, referenceSource: ReferenceSource = "product_name") {
  const apiKey = ENV.ocrSpaceApiKey.trim();
  if (!apiKey) throw new Error("OCR_SPACE_API_KEY is not configured for invoice analysis.");
  const { mimeType, bytes } = decodeDataUrl(dataUrl);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), `invoice.${extensionFor(mimeType)}`);
  form.append("language", "ara");
  form.append("OCREngine", "3");
  form.append("isTable", "true");
  form.append("filetype", mimeType === "application/pdf" ? "PDF" : mimeType === "image/jpeg" ? "JPG" : mimeType.split("/")[1].toUpperCase());

  const response = await fetch(OCR_SPACE_ENDPOINT, { method: "POST", headers: { apikey: apiKey }, body: form });
  const responseText = await response.text();
  let payload: {
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string | string[];
    ParsedResults?: Array<{ ParsedText?: string }>;
    error?: string | { message?: string };
    message?: string;
  } = {};
  try {
    payload = JSON.parse(responseText) as typeof payload;
  } catch {
    // Preserve the existing generic handling for non-JSON provider responses.
  }
  if (!response.ok) {
    const providerValue = payload.ErrorMessage ?? payload.error ?? payload.message ?? responseText.trim();
    const providerMessage = (Array.isArray(providerValue) ? providerValue.join("; ") : typeof providerValue === "object" ? providerValue.message : providerValue)
      ?.toString()
      .replaceAll(apiKey, "[redacted]")
      .replace(/OCR_SPACE_API_KEY/gi, "[redacted]")
      .slice(0, 500);
    throw new Error(`OCR.space invoice analysis failed (${response.status})${providerMessage ? `: ${providerMessage}` : "."}`);
  }
  if (payload.IsErroredOnProcessing) {
    const detail = Array.isArray(payload.ErrorMessage) ? payload.ErrorMessage.join("; ") : payload.ErrorMessage;
    throw new Error(detail || "OCR.space could not process the invoice.");
  }

  const text = (payload.ParsedResults ?? []).map(result => result.ParsedText ?? "").join("\n\n").trim();
  const rows = structureOcrSpaceTable(normalizeMarkdownTable(text), referenceSource);
  if (!rows.length) throw new Error("OCR.space did not identify any valid invoice table rows; product data was not inferred from document headers.");
  const total = rows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0);
  const extraction = {
    "Supplier Name": null,
    "Product Names": rows.map(row => row.productName || null),
    Quantities: rows.map(row => row.quantity),
    "Cost Prices": rows.map(row => row.costPrice),
    References: rows.map(row => row.reference),
    "Total Invoice Amount": rows.length ? total : null,
    "Amount Paid": null,
    Exceptions: [],
  };

  return {
    id: `ocr-space-${Date.now()}`,
    created: Math.floor(Date.now() / 1_000),
    model: "ocr.space-engine-3",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(extraction) } }],
    rawText: text,
    structuredRows: rows,
    extraction,
  };
}

export const ocrSpaceInvoiceEndpoint = OCR_SPACE_ENDPOINT;
