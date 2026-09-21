import { afterEach, describe, expect, it, vi } from "vitest";

const originalForgeUrl = process.env.BUILT_IN_FORGE_API_URL;
const originalForgeKey = process.env.BUILT_IN_FORGE_API_KEY;

function response(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalForgeUrl === undefined) delete process.env.BUILT_IN_FORGE_API_URL;
  else process.env.BUILT_IN_FORGE_API_URL = originalForgeUrl;
  if (originalForgeKey === undefined) delete process.env.BUILT_IN_FORGE_API_KEY;
  else process.env.BUILT_IN_FORGE_API_KEY = originalForgeKey;
  vi.resetModules();
});

describe("invokeLLM response parsing", () => {
  it("reports an empty model response without throwing JSON parse errors", async () => {
    process.env.BUILT_IN_FORGE_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("")));
    const { invokeLLM } = await import("./llm");
    await expect(invokeLLM({ messages: [{ role: "user", content: "test" }] })).rejects.toThrow("Mistral returned an empty response");
  });

  it("reports incomplete model JSON with a controlled error", async () => {
    process.env.BUILT_IN_FORGE_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("{\"choices\":")));
    const { invokeLLM } = await import("./llm");
    await expect(invokeLLM({ messages: [{ role: "user", content: "test" }] })).rejects.toThrow("Mistral returned invalid or incomplete structured output");
  });

  it("parses a valid model response after reading the body safely", async () => {
    process.env.BUILT_IN_FORGE_API_KEY = "test-key";
    const modelContent = JSON.stringify({ rows: [] });
    const modelResponse = JSON.stringify({ choices: [{ message: { content: modelContent } }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(modelResponse)));
    const { invokeLLM } = await import("./llm");
    await expect(invokeLLM({ messages: [{ role: "user", content: "test" }] })).resolves.toMatchObject({ choices: [{ message: { content: modelContent } }] });
  });
});
