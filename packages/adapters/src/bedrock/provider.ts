import type { LLMProvider } from "../llm-provider.js";

interface BedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/**
 * AWS Bedrock LLM provider implementation.
 *
 * Credential format stored in `apiKey`:
 *  - JSON: `{"accessKeyId":"...","secretAccessKey":"...","region":"us-east-1"}`
 *  - Colon-separated: `accessKeyId:secretAccessKey` (region defaults to us-east-1)
 *
 * NOTE: testConnection() validates the credential format without making a live
 * AWS API call. Real Bedrock API calls require AWS Signature Version 4 (SigV4)
 * request signing, which is non-trivial to implement without the AWS SDK.
 * For the MVP, credential format validation provides immediate feedback.
 *
 * NOTE: listModels() returns a hardcoded static list because the Bedrock
 * `ListFoundationModels` API requires SigV4-signed requests and the AWS SDK.
 * The static list covers the most widely used Bedrock models for MVP.
 */
export class BedrockProvider implements LLMProvider {
  private readonly apiKey: string;
  /** Optional custom endpoint (e.g. for VPC endpoints or FIPS endpoints). */
  private readonly baseUrl: string | undefined;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private parseCredentials(): BedrockCredentials {
    const trimmed = this.apiKey.trim();

    if (trimmed.startsWith("{")) {
      // JSON credential format
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        throw new Error("AWS Bedrock: credentials are not valid JSON.");
      }
      const accessKeyId = parsed["accessKeyId"];
      const secretAccessKey = parsed["secretAccessKey"];
      if (typeof accessKeyId !== "string" || !accessKeyId) {
        throw new Error("AWS Bedrock: JSON credentials missing required field: accessKeyId.");
      }
      if (typeof secretAccessKey !== "string" || !secretAccessKey) {
        throw new Error("AWS Bedrock: JSON credentials missing required field: secretAccessKey.");
      }
      const regionRaw = parsed["region"];
      return {
        accessKeyId,
        secretAccessKey,
        region: typeof regionRaw === "string" && regionRaw ? regionRaw : "us-east-1",
      };
    }

    // Colon-separated format: accessKeyId:secretAccessKey
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(
        "AWS Bedrock: credentials must be JSON or colon-separated (accessKeyId:secretAccessKey).",
      );
    }
    const accessKeyId = trimmed.slice(0, colonIdx);
    const secretAccessKey = trimmed.slice(colonIdx + 1);
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS Bedrock: accessKeyId and secretAccessKey must not be empty.");
    }
    return { accessKeyId, secretAccessKey, region: "us-east-1" };
  }

  async testConnection(): Promise<boolean> {
    // NOTE: SigV4 signing is required to make a real AWS API call.
    // For MVP, we validate the credential format and field presence only.
    this.parseCredentials(); // throws on invalid format
    return true;
  }

  async listModels(): Promise<Array<{ id: string; name: string }>> {
    // Bedrock's ListFoundationModels API requires AWS SigV4-signed requests.
    // We return a hardcoded list of the most popular Bedrock foundation models
    // for MVP. Wire up dynamic fetching when the AWS SDK is added.
    return [
      {
        id: "anthropic.claude-3-5-sonnet-20241022-v2:0",
        name: "Anthropic Claude 3.5 Sonnet v2",
      },
      {
        id: "anthropic.claude-3-haiku-20240307-v1:0",
        name: "Anthropic Claude 3 Haiku",
      },
      {
        id: "amazon.titan-text-express-v1",
        name: "Amazon Titan Text Express",
      },
      {
        id: "meta.llama3-70b-instruct-v1:0",
        name: "Meta Llama 3 70B Instruct",
      },
      {
        id: "mistral.mistral-7b-instruct-v0:2",
        name: "Mistral 7B Instruct v0.2",
      },
    ];
  }
}
