import { afterEach, describe, expect, it, vi } from "vitest";

const originalKey = process.env.GEMINI_API_KEY;

const responseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "invoice",
    strict: true as const,
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        code: { type: ["string", "null"] },
        lines: { type: "array", items: { type: "integer" } },
      },
      required: ["name", "code", "lines"],
      additionalProperties: false,
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  vi.resetModules();
});

describe("Gemini invoice vision client", () => {
  it("sends image data to the confirmed Gemini generateContent endpoint with structured JSON output", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: "gemini-2.5-flash", candidates: [{ content: { parts: [{ text: "{\"name\":\"invoice\",\"code\":null,\"lines\":[1]}" }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { analyzeImageWithGemini } = await import("./geminiVision");

    await analyzeImageWithGemini({ dataUrl: "data:image/png;base64,iVBORw0KGgo=", prompt: "Extract.", responseFormat });

    expect(fetchMock).toHaveBeenCalledWith("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-goog-api-key": "test-gemini-key" }),
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts[1]).toEqual({ inline_data: { mime_type: "image/png", data: "iVBORw0KGgo=" } });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.type).toBe("OBJECT");
    expect(body.generationConfig.responseSchema.properties.code).toMatchObject({ type: "STRING", nullable: true });
  });

  it("transcribes a PDF through Gemini and preserves the text for structured extraction", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("%PDF-test", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Arabic invoice text" }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { extractDocumentTextWithGemini } = await import("./geminiVision");

    await expect(extractDocumentTextWithGemini("https://example.test/invoice.pdf")).resolves.toBe("Arabic invoice text");
    expect(fetchMock.mock.calls[1][0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("application/pdf");
  });

  it("fails closed when the server-only Gemini key is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { analyzeImageWithGemini } = await import("./geminiVision");

    await expect(analyzeImageWithGemini({ dataUrl: "data:image/png;base64,iVBORw0KGgo=", prompt: "Extract.", responseFormat })).rejects.toThrow("GEMINI_API_KEY is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces upstream errors without exposing the API key", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400, statusText: "Bad Request" })));
    const { analyzeImageWithGemini } = await import("./geminiVision");

    await expect(analyzeImageWithGemini({ dataUrl: "data:image/png;base64,iVBORw0KGgo=", prompt: "Extract.", responseFormat })).rejects.toThrow("Gemini invoice analysis failed (400)");
  });
});
