import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { OpenAICompatibleModelAdapter } from "./openai-compatible-model.js";

const MOCK_KEYS = { apiKey: "sk-test123" };
const resolveKeys = vi.fn().mockResolvedValue(MOCK_KEYS);

const OPENAI_CRED_REF = { credentialId: "cred-1", provider: "openai" };
const ANTHROPIC_CRED_REF = { credentialId: "cred-2", provider: "anthropic" };

const CHAT_COMPLETION_FIXTURE = {
  id: "chatcmpl-1",
  model: "gpt-4o-mini",
  usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
  choices: [{ message: { content: '{"summary":"bullish"}' } }],
};

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const summarySchema = z.object({ summary: z.string() });

describe("OpenAICompatibleModelAdapter - OpenAI", () => {
  it("testConnection returns ok=true on HTTP 200", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(CHAT_COMPLETION_FIXTURE));
    const adapter = new OpenAICompatibleModelAdapter("openai", resolveKeys, fetchFn);

    const result = await adapter.testConnection(OPENAI_CRED_REF);

    expect(result.ok).toBe(true);
    expect(result.checkedAt).toBeInstanceOf(Date);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("api.openai.com"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer sk-test123" }) }),
    );
  });

  it("testConnection returns ok=false on HTTP 401", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeResponse({ error: { message: "Incorrect API key" } }, 401),
    );
    const adapter = new OpenAICompatibleModelAdapter("openai", resolveKeys, fetchFn);

    const result = await adapter.testConnection(OPENAI_CRED_REF);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Incorrect API key");
  });

  it("testConnection returns ok=false on network error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const adapter = new OpenAICompatibleModelAdapter("openai", resolveKeys, fetchFn);

    const result = await adapter.testConnection(OPENAI_CRED_REF);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("ECONNREFUSED");
  });

  it("generateStructured returns parsed output and usage metadata", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(CHAT_COMPLETION_FIXTURE));
    const adapter = new OpenAICompatibleModelAdapter("openai", resolveKeys, fetchFn);

    const result = await adapter.generateStructured({
      credentialRef: OPENAI_CRED_REF,
      systemPrompt: "You are an analyst.",
      userPrompt: "Summarize the market.",
      outputSchema: summarySchema,
      loggingDepth: "metadata",
    });

    expect(result.output.summary).toBe("bullish");
    expect(result.usage.promptTokens).toBe(20);
    expect(result.usage.completionTokens).toBe(10);
    expect(result.usage.provider).toBe("openai");
    expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("generateStructured sends JSON response format", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(CHAT_COMPLETION_FIXTURE));
    const adapter = new OpenAICompatibleModelAdapter("openai", resolveKeys, fetchFn);

    await adapter.generateStructured({
      credentialRef: OPENAI_CRED_REF,
      systemPrompt: "sys",
      userPrompt: "user",
      outputSchema: summarySchema,
      loggingDepth: "metadata",
    });

    const submitted = fetchFn.mock.calls[0]?.[1] as { body: string };
    const body = JSON.parse(submitted.body) as { response_format?: { type: string } };
    expect(body.response_format?.type).toBe("json_object");
  });

  it("generateStructured throws on HTTP error from provider", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeResponse({ error: { message: "rate limit exceeded" } }, 429),
    );
    const adapter = new OpenAICompatibleModelAdapter("openai", resolveKeys, fetchFn);

    await expect(
      adapter.generateStructured({
        credentialRef: OPENAI_CRED_REF,
        systemPrompt: "sys",
        userPrompt: "user",
        outputSchema: summarySchema,
        loggingDepth: "metadata",
      }),
    ).rejects.toThrow("rate limit exceeded");
  });
});

describe("OpenAICompatibleModelAdapter - Anthropic", () => {
  const anthropicKeys = { apiKey: "sk-ant-test123" };
  const anthropicResolveKeys = vi.fn().mockResolvedValue(anthropicKeys);

  it("testConnection uses Anthropic base URL and x-api-key header", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(CHAT_COMPLETION_FIXTURE));
    const adapter = new OpenAICompatibleModelAdapter("anthropic", anthropicResolveKeys, fetchFn);

    await adapter.testConnection(ANTHROPIC_CRED_REF);

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("api.anthropic.com"),
      expect.objectContaining({ headers: expect.objectContaining({ "x-api-key": "sk-ant-test123" }) }),
    );
  });

  it("uses custom baseUrl when provided in keys", async () => {
    const customKeys = { apiKey: "sk-custom", baseUrl: "https://my-proxy.example.com/v1" };
    const customResolveKeys = vi.fn().mockResolvedValue(customKeys);
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(CHAT_COMPLETION_FIXTURE));
    const adapter = new OpenAICompatibleModelAdapter("openai", customResolveKeys, fetchFn);

    await adapter.testConnection(OPENAI_CRED_REF);

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("my-proxy.example.com"),
      expect.anything(),
    );
  });
});
