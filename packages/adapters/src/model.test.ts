import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import type { ModelProviderAdapter } from "./model.js";

const summarySchema = z.object({ summary: z.string() });
type Summary = z.infer<typeof summarySchema>;

function makeMockAdapter(): ModelProviderAdapter {
  return {
    provider: "anthropic",
    testConnection: vi.fn().mockResolvedValue({ ok: true, message: "Connected", checkedAt: new Date() }),
    generateStructured: vi.fn().mockResolvedValue({
      output: { summary: "Market conditions are bullish." },
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        durationMs: 800,
      },
    }),
  };
}

const credRef = { credentialId: "cred-1", provider: "anthropic" };

describe("ModelProviderAdapter contract", () => {
  it("exposes provider string", () => {
    const adapter = makeMockAdapter();
    expect(adapter.provider).toBe("anthropic");
  });

  it("testConnection returns ok with checkedAt", async () => {
    const adapter = makeMockAdapter();
    const result = await adapter.testConnection(credRef);
    expect(result.ok).toBe(true);
    expect(result.checkedAt).toBeInstanceOf(Date);
  });

  it("generateStructured returns typed output and usage metadata", async () => {
    const adapter = makeMockAdapter();
    const result = await adapter.generateStructured<Summary>({
      credentialRef: credRef,
      systemPrompt: "You are an analyst.",
      userPrompt: "Summarize the market.",
      outputSchema: summarySchema,
      loggingDepth: "metadata",
    });
    expect(result.output.summary).toBeTruthy();
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.usage.provider).toBe("anthropic");
    expect(result.usage.durationMs).toBeGreaterThan(0);
  });

  it("generateStructured is called with correct loggingDepth", async () => {
    const adapter = makeMockAdapter();
    await adapter.generateStructured<Summary>({
      credentialRef: credRef,
      systemPrompt: "sys",
      userPrompt: "user",
      outputSchema: summarySchema,
      loggingDepth: "full",
    });
    expect(adapter.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ loggingDepth: "full" }),
    );
  });
});
