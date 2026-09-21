import { z } from "zod";
import { extractRawOcrRows, ReferenceSource } from "./ocrSpaceTest";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";

export const permittedInvoiceMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type InvoiceMimeType = (typeof permittedInvoiceMimeTypes)[number];

/** This is intentionally the exact public extraction contract requested for invoice parsing. */
export const invoiceExtractionSchema = z
  .object({
    "Supplier Name": z.string().trim().max(255).nullable(),
    "Product Names": z.array(z.string().trim().max(255).nullable()).min(1),
    Codes: z.array(z.string().trim().max(64).nullable()).min(1),
    Quantities: z.array(z.number().int().positive().nullable()).min(1),
    "Cost Prices": z.array(z.number().finite().nonnegative().nullable()).min(1),
    /** Supplier product reference preserved exactly as extracted, including meaningful separators. */
    References: z.array(z.string().max(128).nullable()).min(1),
    "Total Invoice Amount": z.number().finite().nonnegative().nullable(),
    "Amount Paid": z.number().finite().nonnegative().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expectedLength = value["Product Names"].length;
    if (value.Codes.length !== expectedLength || value.Quantities.length !== expectedLength || value["Cost Prices"].length !== expectedLength || value.References.length !== expectedLength) {
      ctx.addIssue({
        code: "custom",
        message: "Product Names, Codes, Quantities, Cost Prices, and References must have the same number of items.",
      });
    }
  });

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

export type ParsedInvoice = {
  extraction: InvoiceExtraction;
  items: Array<{ code: string | null; productName: string | null; quantity: number | null; costPrice: number | null; reference: string | null; sourceIndex: number }>;
  exceptions: Array<{ sourceIndex: number; kind: "missing_reference" | "uncertain_item" | "abnormal_value" | "unmapped_layout"; question: string }>;
  sourceFileKey: string;
  sourceFileUrl: string;
};

/** Preserves a scanned supplier reference exactly as extracted; it never invents or rewrites a code. */
export function normalizeDetectedReference(value: string): string {
  return value;
}

const MAX_INVOICE_BYTES = 8 * 1024 * 1024;

function decodeDataUrl(dataUrl: string, expectedMimeType: InvoiceMimeType): Buffer {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match || match[1] !== expectedMimeType) {
    throw new Error("The invoice data does not match its declared file type.");
  }

  const file = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (file.length === 0 || file.length > MAX_INVOICE_BYTES) {
    throw new Error("Invoice files must be greater than 0 bytes and no larger than 8 MB.");
  }
  const signatureMatches = {
    "image/jpeg": file.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
    "image/png": file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/webp": file.subarray(0, 4).equals(Buffer.from("RIFF")) && file.subarray(8, 12).equals(Buffer.from("WEBP")),
    "application/pdf": file.subarray(0, 4).equals(Buffer.from("%PDF")),
  }[expectedMimeType];
  if (!signatureMatches) throw new Error("The uploaded file contents do not match the supported invoice type.");
  return file;
}

function safeFileName(fileName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  return sanitized || "supplier-invoice";
}

const modelInvoiceResponseSchema = invoiceExtractionSchema.safeExtend({
  Exceptions: z.array(z.object({
    sourceIndex: z.number().int().nonnegative(),
    kind: z.enum(["missing_reference", "uncertain_item", "abnormal_value", "unmapped_layout"]),
    question: z.string().trim().min(1).max(500),
  }).strict()).max(100),
}).strict();

const referenceAnalysisSchema = z.object({
  rows: z.array(z.object({
    sourceIndex: z.number().int().nonnegative(),
    productName: z.string().trim().max(255).nullable(),
    reference: z.string().trim().max(128).nullable(),
    quantity: z.number().int().positive().nullable(),
    costPrice: z.number().finite().nonnegative().nullable(),
    confidence: z.number().min(0).max(1),
    reason: z.string().trim().max(500),
  }).strict()),
}).strict();

const referenceAnalysisResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "invoice_reference_analysis",
    strict: true as const,
    schema: {
      type: "object",
      properties: {
        rows: { type: "array", items: { type: "object", properties: {
          sourceIndex: { type: "integer", minimum: 0 },
          productName: { type: ["string", "null"] },
          reference: { type: ["string", "null"] },
          quantity: { type: ["integer", "null"], minimum: 1 },
          costPrice: { type: ["number", "null"], minimum: 0 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
        }, required: ["sourceIndex", "productName", "reference", "quantity", "costPrice", "confidence", "reason"], additionalProperties: false } },
      },
      required: ["rows"],
      additionalProperties: false,
    },
  },
};

async function analyzeReferencesWithMistral(
  ocrResponse: Record<string, any>,
  referenceSource: ReferenceSource,
  extraction: InvoiceExtraction,
): Promise<InvoiceExtraction> {
  const rawRows = typeof ocrResponse.rawText === "string" ? extractRawOcrRows(ocrResponse.rawText) : [];
  const structuredRows = (rawRows.length ? rawRows : (Array.isArray(ocrResponse.structuredRows) ? ocrResponse.structuredRows : extraction["Product Names"].map((productName, sourceIndex) => ({
    sourceIndex,
    productName,
    code: extraction.Codes[sourceIndex] ?? null,
    reference: null,
    quantity: extraction.Quantities[sourceIndex] ?? null,
    costPrice: extraction["Cost Prices"][sourceIndex] ?? null,
  })))).map((row: Record<string, unknown>, sourceIndex: number) => ({
    ...row,
    sourceIndex,
    reference: null,
  }));
  const response = await invokeLLM({
    model: "mistral-large-latest",
    maxTokens: 6000,
    responseFormat: referenceAnalysisResponseFormat,
    messages: [
      { role: "system", content: "Use a strict two-pass process for each already supplied physical row. Pass 1: inspect the row context and identify the complete designation plus all candidate identifier tokens visually associated with that row; do not decide the Reference yet and do not borrow tokens from a neighboring row. Pass 2: classify the product/manufacturer Reference using position, designation relationship, identifier appearance, and the distinction between model identifiers and descriptive quantities, pack counts, sizes, arbitrary numbers, Code, price, and total. The Code field is always separate and must never be copied, transformed, combined, or reused as Reference. Never use invoice numbers, quantities, prices, totals, page numbers, barcodes, carton counts, dimensions, or descriptive product numbers as References without strong independent product-identifier evidence. Do not use first-number, last-token, or most-numeric-looking rules. Only combine tokens when the visual/semantic evidence clearly shows one product identifier; preserve the visible characters and do not creatively rewrite them. A Reference may be embedded in Product Name, but this stage returns Reference only and the application keeps Product Name unchanged. False positives are worse than null: if evidence is insufficient, return reference null and confidence below 0.6. Return ONLY valid JSON matching the requested schema and keep sourceIndex tied to its supplied row." },
      { role: "user", content: JSON.stringify({ referenceSource, rawOcrText: ocrResponse.rawText ?? null, rows: structuredRows }) },
    ],
  });
  const content = response.choices[0]?.message.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Mistral returned empty structured output.");
  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(content);
  } catch {
    throw new Error("Mistral returned invalid or incomplete structured output.");
  }
  const analysis = referenceAnalysisSchema.parse(parsedContent);
  const byIndex = new Map(analysis.rows.map(row => [row.sourceIndex, row]));
  const productNames = [...extraction["Product Names"]];
  const quantities = [...extraction.Quantities];
  const costPrices = [...extraction["Cost Prices"]];
  const references = productNames.map(() => null as string | null);
  for (let index = 0; index < productNames.length; index += 1) {
    const row = byIndex.get(index);
    if (!row) continue;
    const preMistralReference = extraction.References[index];
    const code = extraction.Codes[index];
    void preMistralReference;
    void code;
    references[index] = row.confidence >= 0.6 ? normalizeDetectedReference(row.reference ?? "") || null : null;
  }
  return { ...extraction, "Product Names": productNames, Quantities: quantities, "Cost Prices": costPrices, References: references };
}

const extractionPrompt = "First visually identify the document-level header, the product table boundaries, and every individual physical product row; never merge two physical rows or split one row unless the image clearly shows it. Then process rows from top to bottom independently: focus on one row, read its visible Arabic glyphs and other text character-by-character from the image, combine only the characters visibly present, and only then extract the quantity, reference, and cost price belonging to that same row. Extract every actual supplier-invoice line into the exact JSON schema, adapting to the document's real layout and column names. Never invent a line, quantity, price, product name, supplier, or reference. Transcribe Arabic and other visible text from the image itself: preserve the visible character sequence, dots, letter shapes, connections, unusual or commercial wording, and partial words; prioritize visual glyph evidence over language expectation and do not translate, transliterate, autocorrect, complete, fix spelling, or replace unclear text with a more familiar word. Re-examine each Arabic row against the original image before returning it, paying attention to dots, connected letters, similar glyphs, thermal artifacts, dropped characters, and added characters; read repeated words from each row rather than copying another row. The four line arrays must have the same length, one position per actual product line; use null for a field genuinely absent from that line. Keep Product Names, References, Quantities, and Cost Prices tied to the same physical row without borrowing or shifting values, and perform a final visual check of each Physical row → Product Name → Reference → Quantity → Cost Price relationship. Product Name and Reference are independent fields: when both are visibly present on one line, preserve the Product Name as printed and also extract the same visible reference into References, even if the reference remains inside Product Names; never drop one because the other is present. Preserve every meaningful reference character exactly as visually printed, including hyphens, slashes, spaces, dots, Arabic or Latin characters, and other separators; read mixed RTL/LTR references in their visual order and do not remove, normalize, reverse, reorder, reconstruct, or invent reference characters. If a product name and reference are combined, separate them only when reliable; otherwise preserve the complete visible text in Product Names and use null for References only when no reference is visibly present. If a line has a reference but no clear product name, keep the reference and use null for Product Names. Keep supplier, customer, phone, address, invoice number, invoice date, and other header information at document level only; never repeat or inject header information into line items or use it as a product reference unless the document visibly identifies it as such. If the invoice has no product lines, return one line only when a genuine line is visible; do not fabricate one. Cost Prices are unit costs. Return an Exceptions entry with a concise confirmation question for every uncertain, abnormal, unmapped, or missing business-critical line value. Use null for document-level monetary values that are not shown. Preserve visible information rather than forcing a fixed supplier template.";

const strictVisualTranscriptionPrompt = "Additional strict transcription rule: read the actual Arabic glyphs in each row from the image, not the word that language prediction expects. Pay particular attention to the visible shapes and dots of ف / ض / ظ / ن / ت / ب / ي; if the image visibly shows محفظة بي, output محفظة بي, never محضنة بي, مخطط بي, or another similar-looking word. Do not linguistically correct, normalize, translate, transliterate, rewrite, or complete the product name. Every numeric character anywhere in the final output MUST be a Western/English digit 0 1 2 3 4 5 6 7 8 9, never an Arabic-Indic digit ٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩. For example, output محفظة بي 1149-5-6, never محفظة بي ١١٤٩-٥-٦. Convert only the digit character set; preserve Arabic words, digit order, hyphens, slashes, dots, spaces, and all other separators exactly. The same visible reference may remain in both Product Names and References. Before returning JSON, visually verify every row's Arabic characters, dot positions, Western digits, reference order, separators, and row-specific text against the image, without copying text from another row.";

const extractionResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "supplier_invoice_extraction",
    strict: true as const,
    schema: {
      type: "object",
      properties: {
        "Supplier Name": { type: ["string", "null"] },
        "Product Names": { type: "array", items: { type: ["string", "null"] } },
        Codes: { type: "array", items: { type: ["string", "null"] } },
        Quantities: { type: "array", items: { type: ["integer", "null"], minimum: 1 } },
        "Cost Prices": { type: "array", items: { type: ["number", "null"], minimum: 0 } },
        References: { type: "array", items: { type: ["string", "null"] } },
        "Total Invoice Amount": { type: ["number", "null"], minimum: 0 },
        "Amount Paid": { type: ["number", "null"], minimum: 0 },
        Exceptions: { type: "array", items: { type: "object", properties: { sourceIndex: { type: "integer", minimum: 0 }, kind: { type: "string", enum: ["missing_reference", "uncertain_item", "abnormal_value", "unmapped_layout"] }, question: { type: "string" } }, required: ["sourceIndex", "kind", "question"], additionalProperties: false } },
      },
      required: ["Supplier Name", "Product Names", "Codes", "Quantities", "Cost Prices", "References", "Total Invoice Amount", "Amount Paid", "Exceptions"],
      additionalProperties: false,
    },
  },
};

const codeReferenceSeparationPrompt = "Critical field distinction: Code is the supplier/invoice table Code column and must never be copied into References. Return the Code only in Codes. Reference is a separate manufacturer/product identifier. Never use Code, quantity, unit price, total, invoice number, or barcode as Reference. If a genuine product Reference cannot be distinguished confidently, return Reference null. Preserve Product Names exactly as visible, including any Reference text inside them.";

async function analyzeInvoiceWithManusVision(dataUrl: string): Promise<Record<string, any>> {
  const response = await invokeLLM({
    model: "gemini-3-flash-preview",
    max_tokens: 24000,
    responseFormat: extractionResponseFormat,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `${extractionPrompt}\n\n${strictVisualTranscriptionPrompt}\n\n${codeReferenceSeparationPrompt}` },
        { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
      ],
    }],
  });
  return response as Record<string, any>;
}

function parseInvoiceModelContent(response: Record<string, any>) {
  const choice = response.choices?.[0];
  const rawContent = choice?.message?.content;
  const content = Array.isArray(rawContent)
    ? rawContent.map((part: Record<string, unknown>) => typeof part?.text === "string" ? part.text : "").join("").trim()
    : typeof rawContent === "string" ? rawContent.trim() : "";
  if (!content) throw new Error(`Manus Vision returned no structured invoice JSON${choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : ""}.`);
  const jsonContent = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let rawResponse: any;
  try {
    rawResponse = JSON.parse(jsonContent);
  } catch {
    throw new Error(`Manus Vision returned incomplete or invalid invoice JSON${choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : ""}.`);
  }
  if (rawResponse && rawResponse["Supplier Name"] === undefined) rawResponse["Supplier Name"] = null;
  if (rawResponse && typeof rawResponse === "object") {
    const lineFields = ["Product Names", "Codes", "Quantities", "Cost Prices", "References"] as const;
    const lineCount = Math.max(...lineFields.map(field => Array.isArray(rawResponse[field]) ? rawResponse[field].length : 0));
    for (const field of lineFields) {
      const values = Array.isArray(rawResponse[field]) ? rawResponse[field] : [];
      rawResponse[field] = [...values, ...Array.from({ length: lineCount - values.length }, () => null)];
    }
  }
  if (Array.isArray(rawResponse?.References)) rawResponse.References = rawResponse.References.map((value: unknown) => typeof value === "string" ? normalizeDetectedReference(value) || null : value);
  return modelInvoiceResponseSchema.parse(rawResponse);
}

export function normalizeExceptions(
  extraction: InvoiceExtraction,
  candidateExceptions: z.infer<typeof modelInvoiceResponseSchema>["Exceptions"],
) {
  const exceptional = new Map<number, z.infer<typeof modelInvoiceResponseSchema>["Exceptions"][number]>();
  for (const exception of candidateExceptions) {
    if (exception.sourceIndex < extraction["Product Names"].length) exceptional.set(exception.sourceIndex, exception);
  }
  extraction.References.forEach((reference, sourceIndex) => {
    if (!reference && !exceptional.has(sourceIndex)) {
      exceptional.set(sourceIndex, {
        sourceIndex,
        kind: "missing_reference",
        question: `No supplier reference was detected for ${extraction["Product Names"][sourceIndex] ?? `line ${sourceIndex + 1}`}. Include this item without a reference?`,
      });
    }
  });
  return Array.from(exceptional.values()).sort((a, b) => a.sourceIndex - b.sourceIndex);
}

/**
 * Stores the original invoice securely then calls the production vision model
 * with a strict JSON schema. No synthetic invoice records are generated here.
 */
export async function parseInvoiceWithVision(input: {
  userId: number;
  fileName: string;
  mimeType: InvoiceMimeType;
  dataUrl: string;
  referenceSource?: ReferenceSource;
}): Promise<ParsedInvoice> {
  const bytes = decodeDataUrl(input.dataUrl, input.mimeType);
  const uploadPromise = storagePut(
    `invoice-sources/${input.userId}/${crypto.randomUUID()}-${safeFileName(input.fileName)}`,
    bytes,
    input.mimeType
  );

  const upload = await uploadPromise;
  const referenceSource = input.referenceSource ?? "product_name";
  const primaryResponse: Record<string, any> = await analyzeInvoiceWithManusVision(input.dataUrl);
  const parsedResponse = parseInvoiceModelContent(primaryResponse);
  const { Exceptions: candidateExceptions, ...ocrExtraction } = parsedResponse;
  const extraction = await analyzeReferencesWithMistral(primaryResponse, referenceSource, ocrExtraction);
  const exceptions = normalizeExceptions(extraction, candidateExceptions);
  const items = extraction["Product Names"].map((productName, index) => ({
    code: extraction.Codes[index],
    productName,
    quantity: extraction.Quantities[index],
    costPrice: extraction["Cost Prices"][index],
    reference: extraction.References[index],
    sourceIndex: index,
  }));

  return { extraction, items, exceptions, sourceFileKey: upload.key, sourceFileUrl: upload.url };
}
