import type { LLMProvider } from "../llm-provider.js";

/** Hardcoded popular Cloudflare Workers AI models used as fallback when no accountId is available. */
const CLOUDFLARE_STATIC_MODELS: Array<{ id: string; name: string }> = [
  { id: "@cf/meta/llama-3.1-8b-instruct", name: "Meta Llama 3.1 8B Instruct" },
  { id: "@cf/meta/llama-3.1-70b-instruct", name: "Meta Llama 3.1 70B Instruct" },
  { id: "@cf/meta/llama-2-7b-chat-int8", name: "Meta Llama 2 7B Chat (int8)" },
  { id: "@cf/mistral/mistral-7b-instruct-v0.1", name: "Mistral 7B Instruct v0.1" },
  { id: "@cf/google/gemma-7b-it", name: "Google Gemma 7B IT" },
  { id: "@cf/qwen/qwen1.5-14b-chat-awq", name: "Qwen 1.5 14B Chat AWQ" },
];

/**
 * Cloudflare AI Gateway LLM provider implementation.
 * Uses the Cloudflare API with a Bearer token (API token).
 * The accountId is parsed from the optional `baseUrl` field.
 */
export class CloudflareProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string | undefined;
  private readonly cfApiBase = "https://api.cloudflare.com/client/v4";

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /** Parse accountId from a Cloudflare API URL like https://api.cloudflare.com/client/v4/accounts/<id>/... */
  private parseAccountId(): string | undefined {
    if (!this.baseUrl) return undefined;
    const match = this.baseUrl.match(/\/accounts\/([^/]+)/);
    return match?.[1];
  }

  async testConnection(): Promise<boolean> {
    const res = await fetch(`${this.cfApiBase}/accounts`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Cloudflare test failed: ${res.status} ${txt}`);
    }
    return true;
  }

  async listModels(): Promise<Array<{ id: string; name: string }>> {
    const accountId = this.parseAccountId();
    if (!accountId) {
      // No accountId available — return a hardcoded static list of popular models
      return CLOUDFLARE_STATIC_MODELS;
    }

    const res = await fetch(
      `${this.cfApiBase}/accounts/${accountId}/ai/models/search`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Cloudflare listModels failed: ${res.status} ${txt}`);
    }
    const data = (await res.json()) as {
      result?: { name: string; description?: string }[];
    };
    return (data?.result ?? []).map((m) => ({ id: m.name, name: m.name }));
  }
}
