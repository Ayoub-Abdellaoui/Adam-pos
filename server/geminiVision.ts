import { ENV } from "./_core/env";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_VISION_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 90_000;
export const GEMINI_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1_000;
const RATE_LIMIT_MAX_DELAY_MS = 20_000;

type GeminiResponseFormat = {
  type: "json_schema";
  json_schema: { name: string; strict: true; schema: Record<string, unknown> };
};

type GeminiSchema = Record<string, unknown>;

type GeminiApiResponse = {
  model?: string;
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

function requireApiKey() {
  const apiKey = ENV.geminiApiKey.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured for invoice analysis.");
  return apiKey;
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : Math.max(0, timestamp - Date.now());
}

export function rateLimitDelayMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  return Math.min(RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt, RATE_LIMIT_MAX_DELAY_MS);
}

const sleep = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

function geminiType(type: unknown): string {
  if (type === "string") return "STRING";
  if (type === "number") return "NUMBER";
  if (type === "integer") return "INTEGER";
  if (type === "boolean") return "BOOLEAN";
  if (type === "array") return "ARRAY";
  if (type === "object") return "OBJECT";
  return "STRING";
}

/** Convert the existing JSON Schema contract into Gemini's responseSchema shape. */
export function toGeminiSchema(schema: Record<string, unknown>): GeminiSchema {
  const rawType = schema.type;
  const nullable = Array.isArray(rawType) && rawType.includes("null");
  const selectedType = Array.isArray(rawType)
    ? rawType.find(value => value !== "null")
    : rawType;
  const result: GeminiSchema = { type: geminiType(selectedType) };

  if (nullable) result.nullable = true;
  if (Array.isArray(schema.enum)) result.enum = schema.enum;
  if (typeof schema.description === "string") result.description = schema.description;

  if (selectedType === "object") {
    const properties = schema.properties;
    if (properties && typeof properties === "object" && !Array.isArray(properties)) {
      result.properties = Object.fromEntries(
        Object.entries(properties as Record<string, unknown>).map(([key, value]) => [
          key,
          value && typeof value === "object" && !Array.isArray(value)
            ? toGeminiSchema(value as Record<string, unknown>)
            : { type: "STRING" },
        ]),
      );
    }
    if (Array.isArray(schema.required)) result.required = schema.required;
  }

  if (selectedType === "array" && schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
    result.items = toGeminiSchema(schema.items as Record<string, unknown>);
  }

  return result;
}

function dataUrlToInlineData(dataUrl: string) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw new Error("Gemini image analysis requires a valid base64 data URL.");
  return { mime_type: match[1], data: match[2].replace(/\s/g, "") };
}

function textFromGeminiResponse(response: GeminiApiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map(part => typeof part.text === "string" ? part.text : "").join("").trim();
  if (!text) throw new Error("Gemini invoice analysis returned no readable content.");
  return text;
}

function toParserCompatibleResponse(response: GeminiApiResponse) {
  return {
    id: `gemini-${Date.now()}`,
    created: Math.floor(Date.now() / 1_000),
    model: response.model ?? GEMINI_VISION_MODEL,
    choices: [{
      index: 0,
      finish_reason: response.candidates?.[0]?.finishReason ?? "stop",
      message: { role: "assistant", content: textFromGeminiResponse(response) },
    }],
  };
}

async function requestGemini(body: Record<string, unknown>) {
  const apiKey = requireApiKey();
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${GEMINI_API_BASE_URL}/models/${GEMINI_VISION_MODEL}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.ok) return response.json() as Promise<GeminiApiResponse>;

      const retryAfterMs = response.status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : undefined;
      const errorText = (await response.text()).slice(0, 500);
      if ((response.status < 500 && response.status !== 429) || attempt === GEMINI_MAX_RETRIES) {
        const suffix = response.status === 429 ? ` after ${GEMINI_MAX_RETRIES} retries` : "";
        throw new Error(`Gemini invoice analysis failed (${response.status})${suffix}: ${errorText}`);
      }
      await sleep(rateLimitDelayMs(attempt, retryAfterMs));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Gemini invoice analysis timed out. Please retry with a smaller file.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Gemini invoice analysis failed after exhausting retries.");
}

function generationConfig(responseFormat?: GeminiResponseFormat) {
  if (!responseFormat) return { maxOutputTokens: 3072 };
  return {
    maxOutputTokens: 3072,
    responseMimeType: "application/json",
    responseSchema: toGeminiSchema(responseFormat.json_schema.schema),
  };
}

export async function analyzeImageWithGemini(input: {
  dataUrl: string;
  prompt: string;
  responseFormat: GeminiResponseFormat;
}) {
  const inlineData = dataUrlToInlineData(input.dataUrl);
  const response = await requestGemini({
    contents: [{ role: "user", parts: [{ text: input.prompt }, { inline_data: inlineData }] }],
    generationConfig: generationConfig(input.responseFormat),
  });
  return toParserCompatibleResponse(response);
}

export async function extractDocumentTextWithGemini(documentUrl: string) {
  const documentResponse = await fetch(documentUrl);
  if (!documentResponse.ok) throw new Error(`Gemini could not read the uploaded PDF (${documentResponse.status}).`);
  const bytes = Buffer.from(await documentResponse.arrayBuffer());
  const response = await requestGemini({
    contents: [{
      role: "user",
      parts: [
        { text: "Transcribe all visible text from this invoice PDF exactly as printed, preserving row order, Arabic characters, Western digit order, and separators. Return plain text only." },
        { inline_data: { mime_type: "application/pdf", data: bytes.toString("base64") } },
      ],
    }],
    generationConfig: generationConfig(),
  });
  return textFromGeminiResponse(response);
}

export async function extractStructuredTextWithGemini(input: {
  text: string;
  prompt: string;
  responseFormat: GeminiResponseFormat;
}) {
  const response = await requestGemini({
    contents: [{ role: "user", parts: [{ text: `${input.prompt}\n\nOCR text:\n${input.text}` }] }],
    generationConfig: generationConfig(input.responseFormat),
  });
  return toParserCompatibleResponse(response);
}

export const geminiVisionModel = GEMINI_VISION_MODEL;
export const geminiApiEndpoint = `${GEMINI_API_BASE_URL}/models/${GEMINI_VISION_MODEL}:generateContent`;
