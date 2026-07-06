import { z } from "zod";
import type {
  ModelProviderAdapter,
  ModelCredentialRef,
  ModelConnectionStatus,
  StructuredModelRequest,
  StructuredModelResult,
} from "../model.js";

export interface OpenAICompatibleApiKeys {
  apiKey: string;
  baseUrl?: string | undefined;
  /** Specific model to use, e.g. "gpt-4o", "claude-sonnet-4-6", "openrouter/anthropic/claude-3.5-sonnet", "llama3.2" */
  model?: string | undefined;
}

type FetchFn = typeof fetch;

const KNOWN_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
};

const KNOWN_DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
};

/** Minimal OpenAI-compatible chat completions payload */
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

interface ChatCompletionResponse {
  id: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  choices: Array<{
    message: { content: string };
  }>;
}

function resolveModel(provider: string, keys: OpenAICompatibleApiKeys): string {
  if (keys.model) return keys.model;
  return KNOWN_DEFAULT_MODELS[provider] ?? "gpt-4o-mini";
}

function resolveBaseUrl(provider: string, keys: OpenAICompatibleApiKeys): string {
  if (keys.baseUrl) return keys.baseUrl.replace(/\/$/, "");
  return KNOWN_BASE_URLS[provider] ?? (KNOWN_BASE_URLS["openai"] as string);
}

function authHeaders(apiKey: string, provider: string): Record<string, string> {
  if (provider === "anthropic") {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
      "content-type": "application/json",
    };
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function promptCachingEnabled(provider: string): boolean {
  return provider === "anthropic" || provider === "openrouter";
}

function buildSystemMessage(provider: string, systemPrompt: string): ChatMessage {
  if (promptCachingEnabled(provider)) {
    return {
      role: "system",
      content: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    };
  }
  return { role: "system", content: systemPrompt };
}

export class OpenAICompatibleModelAdapter implements ModelProviderAdapter {
  readonly provider: string;

  constructor(
    provider: string,
    private readonly resolveKeys: (credentialId: string) => Promise<OpenAICompatibleApiKeys>,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    this.provider = provider;
  }

  async testConnection(input: ModelCredentialRef): Promise<ModelConnectionStatus> {
    const checkedAt = new Date();
    try {
      const keys = await this.resolveKeys(input.credentialId);
      const base = resolveBaseUrl(input.provider, keys);
      const model = resolveModel(input.provider, keys);

      const res = await this.fetchFn(`${base}/chat/completions`, {
        method: "POST",
        headers: authHeaders(keys.apiKey, input.provider),
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        } satisfies ChatCompletionRequest),
      });

      if (res.ok) return { ok: true, message: `Connected (${model})`, checkedAt };
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      const msg = body.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, message: msg, checkedAt };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Unknown error", checkedAt };
    }
  }

  async generateStructured<T>(input: StructuredModelRequest<T>): Promise<StructuredModelResult<T>> {
    const keys = await this.resolveKeys(input.credentialRef.credentialId);
    const base = resolveBaseUrl(input.credentialRef.provider, keys);
    const model = resolveModel(input.credentialRef.provider, keys);
    const start = Date.now();

    const schemaInstruction = input.schemaHint
      ? `\n\nRespond with valid JSON only. Your response must match this exact shape:\n${input.schemaHint}`
      : "\n\nRespond with valid JSON only.";

    const payload: ChatCompletionRequest = {
      model,
      messages: [
        buildSystemMessage(input.credentialRef.provider, input.systemPrompt + schemaInstruction),
        { role: "user", content: input.userPrompt },
      ],
      response_format: { type: "json_object" },
      ...(input.maxTokens !== undefined && { max_tokens: input.maxTokens }),
    };

    const res = await this.fetchFn(`${base}/chat/completions`, {
      method: "POST",
      headers: authHeaders(keys.apiKey, input.credentialRef.provider),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Model generation failed: ${body.error?.message ?? `HTTP ${res.status}`}`);
    }

    const body = (await res.json()) as ChatCompletionResponse;
    const content = body.choices[0]?.message.content ?? "";
    const parsed: unknown = JSON.parse(content);
    const output = input.outputSchema.parse(parsed);

    return {
      output,
      usage: {
        promptTokens: body.usage?.prompt_tokens ?? 0,
        completionTokens: body.usage?.completion_tokens ?? 0,
        totalTokens: body.usage?.total_tokens ?? 0,
        model: body.model ?? model,
        provider: this.provider,
        durationMs: Date.now() - start,
      },
    };
  }
}

/** Validate that string is parseable JSON matching the given Zod schema */
export function parseModelOutput<T>(content: string, schema: z.ZodType<T>): T {
  const parsed: unknown = JSON.parse(content);
  return schema.parse(parsed);
}
