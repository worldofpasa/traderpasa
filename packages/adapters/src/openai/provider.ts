import type { LLMProvider } from "../llm-provider.js";

/**
 * OpenAI LLM provider implementation.
 * Uses the public `/v1/models` endpoint for both testing the key and
 * fetching the model catalogue.
 */
export class OpenAIProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.openai.com/v1";

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
      throw new Error(`OpenAI test failed: ${res.status} ${txt}`);
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
      throw new Error(`OpenAI listModels failed: ${res.status} ${txt}`);
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    // openai returns { data: [{ id, ...}] }
    return (data?.data ?? []).map((m) => ({ id: m.id, name: m.id }));
  }
}
