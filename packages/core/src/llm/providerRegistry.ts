// packages/core/src/llm/providerRegistry.ts
// Static registry of supported LLM providers for the onboarding/settings UI.

import {
  OpenAIProvider,
  OpenRouterProvider,
  AnthropicProvider,
  GeminiProvider,
  CloudflareProvider,
  GroqProvider,
  VercelProvider,
  VertexProvider,
  BedrockProvider,
} from "@pasa-trader/adapters";
import type { LLMProvider } from "@pasa-trader/adapters";

export interface ProviderInfo {
  id: string;
  displayName: string;
  docsUrl: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  requiresBaseUrl: boolean;
  baseUrlLabel?: string;
  baseUrlPlaceholder?: string;
  baseUrlDefault?: string;
  notes?: string;
}

export const PROVIDER_INFOS: ProviderInfo[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    docsUrl: "https://platform.openai.com/api-keys",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "sk-...",
    requiresBaseUrl: false,
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    docsUrl: "https://console.anthropic.com/settings/keys",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "sk-ant-...",
    requiresBaseUrl: false,
  },
  {
    id: "gemini",
    displayName: "Google Gemini",
    docsUrl: "https://aistudio.google.com/app/apikey",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "AIza...",
    requiresBaseUrl: false,
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    docsUrl: "https://openrouter.ai/settings/keys",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "sk-or-...",
    requiresBaseUrl: false,
  },
  {
    id: "groq",
    displayName: "Groq",
    docsUrl: "https://console.groq.com/keys",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "gsk_...",
    requiresBaseUrl: false,
  },
  {
    id: "cloudflare",
    displayName: "Cloudflare AI Gateway",
    docsUrl: "https://developers.cloudflare.com/ai-gateway/get-started/",
    apiKeyLabel: "Cloudflare API Token",
    apiKeyPlaceholder: "CF API token",
    requiresBaseUrl: true,
    baseUrlLabel: "Account ID",
    baseUrlPlaceholder: "Your Cloudflare account ID",
    notes: "Find your Account ID in the Cloudflare dashboard sidebar.",
  },
  {
    id: "vercel",
    displayName: "Vercel AI Gateway",
    docsUrl: "https://vercel.com/docs/ai",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "Bearer token",
    requiresBaseUrl: true,
    baseUrlLabel: "Gateway URL",
    baseUrlPlaceholder: "https://...",
    baseUrlDefault: "https://api.v0.dev/v1",
    notes: "The Vercel AI Gateway is OpenAI-compatible. Set the URL to your gateway endpoint.",
  },
  {
    id: "vertex",
    displayName: "Google Vertex AI",
    docsUrl: "https://cloud.google.com/vertex-ai/docs/authentication",
    apiKeyLabel: "Access Token or Service Account JSON",
    apiKeyPlaceholder: "Paste access token or service account JSON",
    requiresBaseUrl: false,
    notes: "Paste a short-lived access token or the full JSON content of a service account key file.",
  },
  {
    id: "bedrock",
    displayName: "AWS Bedrock",
    docsUrl: "https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html",
    apiKeyLabel: "Credentials (JSON)",
    apiKeyPlaceholder: '{"accessKeyId":"...","secretAccessKey":"...","region":"us-east-1"}',
    requiresBaseUrl: false,
    notes: "Provide JSON with accessKeyId, secretAccessKey, and optionally region (default: us-east-1).",
  },
];

export function createProvider(providerId: string, apiKey: string, baseUrl?: string): LLMProvider {
  switch (providerId) {
    case "openai": return new OpenAIProvider(apiKey);
    case "anthropic": return new AnthropicProvider(apiKey);
    case "gemini": return new GeminiProvider(apiKey);
    case "openrouter": return new OpenRouterProvider(apiKey);
    case "groq": return new GroqProvider(apiKey);
    case "cloudflare": return new CloudflareProvider(apiKey, baseUrl);
    case "vercel": return new VercelProvider(apiKey, baseUrl);
    case "vertex": return new VertexProvider(apiKey);
    case "bedrock": return new BedrockProvider(apiKey);
    default: throw new Error(`Unknown LLM provider: ${providerId}`);
  }
}
