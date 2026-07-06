import type { LLMProvider } from "../llm-provider.js";

/**
 * Google Gemini (Google AI Studio) LLM provider implementation.
 * Uses the Generative Language REST API with a query-param API key.
 */
export class GeminiProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async testConnection(): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/models?key=${encodeURIComponent(this.apiKey)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Gemini test failed: ${res.status} ${txt}`);
    }
    return true;
  }

  async listModels(): Promise<Array<{ id: string; name: string }>> {
    const res = await fetch(`${this.baseUrl}/models?key=${encodeURIComponent(this.apiKey)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Gemini listModels failed: ${res.status} ${txt}`);
    }
    const data = (await res.json()) as { models?: { name: string; displayName: string }[] };
    // The `name` field is like "models/gemini-1.5-pro" — use the full string as id
    return (data?.models ?? []).map((m) => ({
      id: m.name,
      name: m.displayName ?? m.name,
    }));
  }
}
