import type { LLMProvider } from "../llm-provider.js";

/**
 * Anthropic LLM provider implementation.
 * Uses the Anthropic `/v1/models` endpoint for connection testing and
 * model catalogue retrieval.
 */
export class AnthropicProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.anthropic.com/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01",
      Accept: "application/json",
    };
  }

  async testConnection(): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/models`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Anthropic test failed: ${res.status} ${txt}`);
    }
    return true;
  }

  async listModels(): Promise<Array<{ id: string; name: string }>> {
    const res = await fetch(`${this.baseUrl}/models`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Anthropic listModels failed: ${res.status} ${txt}`);
    }
    const data = (await res.json()) as { data?: { id: string; display_name: string }[] };
    return (data?.data ?? []).map((m) => ({ id: m.id, name: m.display_name ?? m.id }));
  }
}
