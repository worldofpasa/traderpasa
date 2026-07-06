import type { LLMProvider } from "../llm-provider.js";

/**
 * Groq LLM provider implementation.
 * Groq uses an OpenAI-compatible API at api.groq.com/openai/v1.
 */
export class GroqProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.groq.com/openai/v1";

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
      throw new Error(`Groq test failed: ${res.status} ${txt}`);
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
      throw new Error(`Groq listModels failed: ${res.status} ${txt}`);
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    // Groq's response: { data: [{ id, ... }, ...] } — use id as the display name too
    return (data?.data ?? []).map((m) => ({ id: m.id, name: m.id }));
  }
}
