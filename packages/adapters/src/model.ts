import type { z } from "zod";

export interface ModelCredentialRef {
  credentialId: string;
  provider: string;
}

export interface ModelConnectionStatus {
  ok: boolean;
  message: string;
  checkedAt: Date;
}

export type ModelLoggingDepth = "metadata" | "full";

export interface StructuredModelRequest<T> {
  credentialRef: ModelCredentialRef;
  systemPrompt: string;
  userPrompt: string;
  outputSchema: z.ZodType<T>;
  /** Human-readable JSON template injected into system prompt so the model knows expected fields */
  schemaHint?: string;
  /** Max tokens for the model response */
  maxTokens?: number;
  loggingDepth: ModelLoggingDepth;
}

export interface ModelUsageMetadata {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  provider: string;
  durationMs: number;
}

export interface StructuredModelResult<T> {
  output: T;
  usage: ModelUsageMetadata;
  rawResponseRef?: string;
}

export interface ModelProviderAdapter {
  readonly provider: string;
  testConnection(input: ModelCredentialRef): Promise<ModelConnectionStatus>;
  generateStructured<T>(input: StructuredModelRequest<T>): Promise<StructuredModelResult<T>>;
}
