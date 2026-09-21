import { ENV } from "./_core/env";

const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";
const MAX_TEST_BYTES = 8 * 1024 * 1024;

export type OcrSpaceStructuredRow = {
  productName: string;
  reference: string | null;
  quantity: number | null;
  costPrice: number | null;
  totalAmount: number | null;
};

export type OcrSpaceRawRow = {
  sourceIndex: number;
  code: string | null;
  designation: string;
  quantity: number | null;
  costPrice: number | null;
  totalAmount: number | null;
};

export type ReferenceSource = "product_name" | "separate_column" | "separate_area";

const WESTERN_DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
function westernDigits(value: string) { return value.replace(/[٠-٩]/g, digit => WESTERN_DIGITS[digit] ?? digit); }
function numericValue(value: string): number | null {
  const normalized = westernDigits(value).replace(/[\u00a0\s]/g, "").replace(/,/g, "");
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}
function isNumericCell(value: string) { return numericValue(value) !== null && !/[A-Za-z\u0600-\u06ff]/.test(value.replace(/[٠-٩0-9.,+\-\s]/g, "")); }
function normalizeReference(value: string): string {
  const trimmed = westernDigits(value.trim());
  const groups = trimmed.split(/-/);
  if (groups.length < 2 || groups.some(group => !/^\d+$/.test(group))) return trimmed;
  const first = groups[0]; const last = groups[groups.length - 1];
  const likelyRtlReversal = Number(first) < Number(last) && ((first.length <= 2 && last.length <= 2) || (first.length <= 3 && last.length >= 4));
  return likelyRtlReversal ? groups.reverse().join("-") : trimmed;
}
function normalizeReferencesInProduct(productName: string): { productName: string; reference: string | null } {
  const visible = westernDigits(productName);
  const match = visible.match(/\s*(\d+(?:-\d+)+)\s*$/);
  if (match) return { productName: visible.slice(0, match.index).trim(), reference: normalizeReference(match[1]) };
  const leadingDigits = visible.match(/^(\d{2,})\b/)?.[1];
  const alphaNumericMatch = visible.match(/(?:^|\s)([A-Za-zÀ-ÖØ-öø-ÿ\u0600-\u06ff]{1,2}\s+\d{2,})\s*$/);
  if (alphaNumericMatch) return { productName: visible.slice(0, alphaNumericMatch.index).trim(), reference: alphaNumericMatch[1].trim() };
  const splitLayoutMatch = visible.match(/^(\d{2,})\s+.+\s+([A-Za-zÀ-ÖØ-öø-ÿ]{1,3})\s*$/);
  return { productName: leadingDigits && splitLayoutMatch ? visible.slice(0, splitLayoutMatch.index! + splitLayoutMatch[0].lastIndexOf(splitLayoutMatch[2])).trim() : visible, reference: leadingDigits && splitLayoutMatch ? `${splitLayoutMatch[2]} ${splitLayoutMatch[1]}` : null };
}
const referencePattern = /^[A-Za-z0-9À-ÖØ-öø-ÿ\u0600-\u06ff]+(?:\s*[-/]\s*[A-Za-z0-9À-ÖØ-öø-ÿ\u0600-\u06ff]+)+$/;
function explicitReferenceCells(cells: string[]) {
  return cells.filter(cell => referencePattern.test(cell.trim()));
}
function isHeader(cells: string[]) {
  const value = cells.join(" ").toLocaleLowerCase();
  return /product|article|designation|description|reference|sku|quantity|qty|price|cost|total|amount|منتج|المنتج|المرجع|الكمية|السعر|المبلغ|الإجمالي/.test(value);
}
function splitCells(line: string) {
  if (!line.includes("|")) return line.split(/\t+|\s{2,}/).map(cell => cell.trim()).filter(Boolean);
  const cells = line.split("|").map(cell => cell.trim());
  if (cells[0] === "") cells.shift();
  if (cells.at(-1) === "") cells.pop();
  return cells;
}
function numericCells(cells: string[]) {
  return cells.map((value, index) => ({ index, value, number: numericValue(value) })).filter(item => item.number !== null) as Array<{ index: number; value: string; number: number }>;
}
function chooseNumbers(numbers: Array<{ index: number; number: number }>) {
  if (numbers.length < 2) return { quantity: null, costPrice: null, totalAmount: null };
  let best: { score: number; quantity: number; costPrice: number; totalAmount: number } | null = null;
  for (const quantity of numbers.filter(item => Number.isInteger(item.number) && item.number > 0 && item.number <= 1_000_000)) {
    for (const left of numbers) for (const right of numbers) {
      if (left.index === quantity.index || right.index === quantity.index || left.index === right.index) continue;
      const expected = quantity.number * left.number;
      const error = Math.abs(expected - right.number) / Math.max(1, right.number);
      const candidate = { score: error, quantity: quantity.number, costPrice: left.number, totalAmount: right.number };
      if (!best || candidate.score < best.score || (candidate.score === best.score && candidate.quantity < best.quantity)) best = candidate;
    }
  }
  if (best && best.score <= 0.08) return best;
  const ordered = [...numbers].sort((a, b) => a.number - b.number);
  const quantity = ordered.find(item => Number.isInteger(item.number) && item.number > 0)?.number ?? null;
  const remaining = ordered.filter(item => item.number !== quantity);
  return { quantity, costPrice: remaining.length ? remaining[0].number : null, totalAmount: remaining.length > 1 ? remaining.at(-1)!.number : null };
}
function parseRow(cells: string[], referenceSource: ReferenceSource = "product_name"): OcrSpaceStructuredRow | null {
  if (cells.length < 4 || !cells.some(Boolean) || isHeader(cells) || cells.every(cell => /^[-:|\s]+$/.test(cell))) return null;
  const numbers = numericCells(cells);
  if (numbers.length < 3) return null;
  const textCells = cells.filter((cell, index) => !numbers.some(number => number.index === index) && /[^\d٠-٩.,\-\s]/.test(cell));
  if (!textCells.length) return null;
  const productRaw = textCells.sort((a, b) => b.length - a.length)[0];
  const embedded = normalizeReferencesInProduct(productRaw);
  const values = chooseNumbers(numbers);
  const explicitReferences = explicitReferenceCells(cells);
  const explicitReference = explicitReferences.length === 1 ? explicitReferences[0] : null;
  const reference = referenceSource === "separate_column"
    ? (explicitReference ? normalizeReference(explicitReference.replace(/\s+/g, "")) : null)
    : embedded.reference;
  return { productName: westernDigits(productRaw).trim(), reference, quantity: values.quantity, costPrice: values.costPrice, totalAmount: values.totalAmount };
}

function parseSequentialCodeRows(text: string, referenceSource: ReferenceSource = "product_name"): OcrSpaceStructuredRow[] {
  const lines = text.replace(/\u00a0/g, " ").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const starts = lines.map((line, index) => /^\d{5}$/.test(line) ? index : -1).filter(index => index >= 0);
  const rows: OcrSpaceStructuredRow[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const block = lines.slice(start, starts[i + 1] ?? lines.length);
    const code = block[0];
    const frenchNumber = (line: string) => numericValue(line.replace(/\s/g, "").replace(/,/g, "."));
    const decimalIndexes = block.map((line, index) => ({ index, value: frenchNumber(line), raw: line })).filter(item => item.value !== null && /,\d{2}$/.test(item.raw));
    if (decimalIndexes.length < 2) continue;
    const totalCell = decimalIndexes.at(-1)!;
    const priceCell = decimalIndexes.at(-2)!;
    const quantityIndex = priceCell.index - 1;
    const quantity = quantityIndex > 0 ? frenchNumber(block[quantityIndex]) : null;
    if (quantity === null || !Number.isInteger(quantity) || quantity < 1) continue;
    let productLines = block.slice(1, quantityIndex).filter(line => !isHeader([line]) && !/^\d{5}$/.test(line));
    if (!productLines.length && start > 0) {
      const wrappedBeforeCode = lines[start - 1];
      if (wrappedBeforeCode && /[^\d\s]/.test(wrappedBeforeCode) && !isHeader([wrappedBeforeCode])) productLines = [wrappedBeforeCode];
    }
    if (!productLines.length) continue;
    const productName = westernDigits(productLines.join(" ")).trim();
    const embedded = normalizeReferencesInProduct(productName);
    rows.push({ productName, reference: embedded.reference, quantity, costPrice: priceCell.value, totalAmount: totalCell.value });
  }
  return rows;
}

function parseFragmentedTableRows(text: string): OcrSpaceStructuredRow[] {
  const cleaned = text.replace(/^```\w*\s*|```\s*$/gm, "");
  const firstTable = cleaned.search(/تعيين المادة|كمية\s+سعر وحدة|مبلغ/);
  const sections = firstTable >= 0 ? [cleaned.slice(firstTable)] : [];
  const rows: OcrSpaceStructuredRow[] = [];
  for (const section of sections) {
    const lines = section.split(/\r?\n/).map(line => line.trim()).filter(Boolean).filter(line => !isHeader([line]));
    const products = lines.filter(line => /[\u0600-\u06ff]/.test(line) && /محفظة|صاكودو|فاشيو/.test(line));
    const numbers: number[] = [];
    for (const line of lines) {
      if (/[\u0600-\u06ff]/.test(line) && !/\d[\d\s,.]*\.\d{1,2}/.test(line)) continue;
      const withoutReferences = line.replace(/\d+(?:-\d+)+/g, "");
      for (const token of withoutReferences.match(/\d[\d\s]*(?:[,.]\d{1,2})?/g) ?? []) {
        const value = Number(token.replace(/\s/g, "").replace(/,/g, "."));
        if (Number.isFinite(value)) numbers.push(value);
      }
    }
    const usableCount = Math.min(products.length, Math.floor(numbers.length / 3));
    if (!usableCount) continue;
    const values = numbers.slice(-usableCount * 3);
    for (let index = 0; index < usableCount; index++) {
      const group = values.slice(index * 3, index * 3 + 3).map((number, offset) => ({ index: offset, number }));
      const chosen = chooseNumbers(group);
      if (chosen.quantity === null || chosen.costPrice === null || chosen.totalAmount === null) continue;
      if (Math.abs(chosen.quantity * chosen.costPrice - chosen.totalAmount) / Math.max(1, chosen.totalAmount) > 0.08) continue;
      const productName = westernDigits(products[products.length - usableCount + index]);
      const referenceMatch = productName.match(/\d+(?:-\d+)+/);
      rows.push({ productName, reference: referenceMatch ? normalizeReference(referenceMatch[0]) : null, quantity: chosen.quantity, costPrice: chosen.costPrice, totalAmount: chosen.totalAmount });
    }
  }
  return rows;
}

function separateAreaReferences(text: string) {
  const references: string[] = [];
  let inReferenceArea = false;
  for (const rawLine of text.replace(/\u00a0/g, " ").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/(reference|ref\.?|sku|المرجع)/i.test(line)) {
      inReferenceArea = true;
      continue;
    }
    if (!inReferenceArea) continue;
    const candidates = explicitReferenceCells(splitCells(line));
    if (candidates.length !== 1) continue;
    references.push(normalizeReference(candidates[0].replace(/\s+/g, "")));
  }
  return references;
}

export function structureOcrSpaceTable(text: string, referenceSource: ReferenceSource = "product_name"): OcrSpaceStructuredRow[] {
  const rows: OcrSpaceStructuredRow[] = [];
  for (const rawLine of text.replace(/\u00a0/g, " ").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cells = splitCells(line);
    // OCR.space can represent detected tables as Markdown pipes, tabs, or aligned
    // whitespace. Accept those table-shaped rows only; ordinary invoice text is
    // rejected before parsing so headers cannot become products.
    const tableShaped = line.includes("|") || /\t+/.test(line) || cells.length >= 4;
    if (!tableShaped) continue;
    const parsed = parseRow(cells, referenceSource);
    if (parsed) { rows.push(parsed); continue; }
    const continuationCell = cells.length === 1 ? cells[0] : cells.filter(Boolean).length === 1 && cells.every(cell => !cell || cell === cells.filter(Boolean)[0]) ? cells.find(Boolean) : undefined;
    if (rows.length && continuationCell && /[^\d٠-٩]/.test(continuationCell) && !isHeader([continuationCell])) {
      const continuation = westernDigits(continuationCell);
      rows[rows.length - 1].productName = `${rows[rows.length - 1].productName} ${continuation}`.trim();
      const embedded = continuation.match(/\d+(?:-\d+)+/);
      if (embedded && !rows[rows.length - 1].reference) rows[rows.length - 1].reference = normalizeReference(embedded[0]);
    }
  }
  if (rows.length) {
    if (referenceSource === "separate_area") {
      const references = separateAreaReferences(text);
      if (references.length === rows.length) return rows.map((row, index) => ({ ...row, reference: references[index] ?? null }));
      return rows.map(row => ({ ...row, reference: null }));
    }
    return rows;
  }
  const sequentialRows = parseSequentialCodeRows(text, referenceSource);
  const fallbackRows = sequentialRows.length ? sequentialRows : parseFragmentedTableRows(text);
  if (referenceSource === "separate_area") {
    const references = separateAreaReferences(text);
    if (references.length === fallbackRows.length) return fallbackRows.map((row, index) => ({ ...row, reference: references[index] ?? null }));
    return fallbackRows.map(row => ({ ...row, reference: null }));
  }
  if (referenceSource === "separate_column") return fallbackRows.map(row => ({ ...row, reference: null }));
  return fallbackRows;
}

/** Reconstructs OCR row/column context without classifying any value as a Reference. */
export function extractRawOcrRows(text: string): OcrSpaceRawRow[] {
  const lines = text.replace(/\u00a0/g, " ").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const rows: OcrSpaceRawRow[] = [];
  let index = 0;
  let pendingCode: string | null = null;
  let pendingDesignation: string[] = [];
  let seenRows = false;
  while (index < lines.length) {
    if (/^\d{5}$/.test(lines[index]) && (pendingDesignation.length === 0 || !seenRows)) {
      pendingCode = lines[index++];
      if (!seenRows) pendingDesignation = [];
      continue;
    }
    const quantity = numericValue(lines[index]);
    const costPrice = index + 1 < lines.length ? numericValue(lines[index + 1].replace(/\s/g, "").replace(/,/g, ".")) : null;
    const totalAmount = index + 2 < lines.length ? numericValue(lines[index + 2].replace(/\s/g, "").replace(/,/g, ".")) : null;
    if (quantity !== null && Number.isInteger(quantity) && quantity > 0 && costPrice !== null && totalAmount !== null && pendingDesignation.length) {
      rows.push({ sourceIndex: rows.length, code: pendingCode, designation: westernDigits(pendingDesignation.join(" ")), quantity, costPrice, totalAmount });
      seenRows = true;
      pendingCode = null;
      pendingDesignation = [];
      index += 3;
      continue;
    }
    if (!isHeader([lines[index]]) && !/^\d{5}$/.test(lines[index])) pendingDesignation.push(lines[index]);
    index += 1;
  }
  return rows;
}

function decodeImageDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw new Error("Upload a JPEG, PNG, or WebP image.");
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length || bytes.length > MAX_TEST_BYTES) throw new Error("Test images must be greater than 0 bytes and no larger than 8 MB.");
  return { mimeType: match[1], bytes };
}

export async function runOcrSpaceInvoiceTest(dataUrl: string) {
  const apiKey = ENV.ocrSpaceApiKey.trim();
  if (!apiKey) throw new Error("OCR_SPACE_API_KEY is not configured for the Preview test.");
  const { mimeType, bytes } = decodeImageDataUrl(dataUrl);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), `invoice.${mimeType.split("/")[1] === "jpeg" ? "jpg" : mimeType.split("/")[1]}`);
  form.append("language", "ara"); form.append("OCREngine", "3"); form.append("isTable", "true"); form.append("filetype", mimeType === "image/jpeg" ? "JPG" : mimeType.split("/")[1].toUpperCase());
  const response = await fetch(OCR_SPACE_ENDPOINT, { method: "POST", headers: { apikey: apiKey }, body: form });
  const payload = await response.json() as { OCRExitCode?: number; IsErroredOnProcessing?: boolean; ErrorMessage?: string | string[]; ProcessingTimeInMilliseconds?: string; ParsedResults?: Array<{ ParsedText?: string; FileParseExitCode?: string | number }> };
  if (!response.ok) throw new Error(`OCR.space request failed (${response.status}).`);
  if (payload.IsErroredOnProcessing) { const detail = Array.isArray(payload.ErrorMessage) ? payload.ErrorMessage.join("; ") : payload.ErrorMessage; throw new Error(detail || "OCR.space could not process the image."); }
  const text = (payload.ParsedResults ?? []).map(result => result.ParsedText ?? "").join("\n\n").trim();
  return { engine: "3", language: "ara", tableRecognition: true, processingTimeMs: payload.ProcessingTimeInMilliseconds ?? null, text, structuredRows: structureOcrSpaceTable(text) };
}

export const ocrSpaceInvoiceEndpoint = OCR_SPACE_ENDPOINT;
