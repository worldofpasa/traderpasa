import type { LLMProvider } from "../llm-provider.js";

const DEFAULT_VERCEL_BASE_URL = "https://api.v0.dev/v1";

/**
 * Vercel AI Gateway LLM provider implementation.
 * The Vercel AI Gateway is OpenAI-compatible; optionally accepts a custom
 * `baseUrl` for self-hosted or enterprise gateway endpoints.
 */
export class VercelProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? DEFAULT_VERCEL_BASE_URL;
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
      throw new Error(`Vercel AI Gateway test failed: ${res.status} ${txt}`);
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
      throw new Error(`Vercel AI Gateway listModels failed: ${res.status} ${txt}`);
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    // OpenAI-compatible response: { data: [{ id }, ...] }
    return (data?.data ?? []).map((m) => ({ id: m.id, name: m.id }));
  }
}
