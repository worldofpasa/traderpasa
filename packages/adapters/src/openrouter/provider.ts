import type { LLMProvider } from "../llm-provider.js";

/**
 * OpenRouter LLM provider implementation.
 * Expects a valid OpenRouter API key.
 * Uses the public `/v1/models` endpoint for both testing the key and
 * retrieving the model catalogue.
 */
export class OpenRouterProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl = "https://openrouter.ai/api/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async testConnection(): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenRouter test failed: ${res.status} ${txt}`);
    }
    return true;
  }

  async listModels(): Promise<Array<{ id: string; name: string }>> {
    const res = await fetch(`${this.baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenRouter listModels failed: ${res.status} ${txt}`);
    }
    const data = (await res.json()) as { data?: { id: string; name?: string }[] };
    // The OpenRouter response format: { data: [{ id, name, ... }, ...] }
    return (data?.data ?? []).map((m) => ({ id: m.id, name: m.name ?? m.id }));
  }
}
