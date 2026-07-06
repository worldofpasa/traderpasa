import type { LLMProvider } from "../llm-provider.js";

/**
 * Google Vertex AI LLM provider implementation.
 *
 * Authentication:
 *  - If `apiKey` starts with `{`, it is treated as a service-account JSON string.
 *    We validate that it has the required `client_email` and `private_key` fields.
 *  - Otherwise it is treated as a short-lived OAuth2 Bearer access token.
 *
 * NOTE: listModels() returns a hardcoded static list because the Vertex AI
 * models endpoint requires a GCP project ID which is not stored in the
 * credential's `apiKey` field. Fetching models dynamically would require
 * a separate `project` field and full OAuth2 token exchange logic.
 */
export class VertexProvider implements LLMProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /** Returns true if the stored credential looks like service-account JSON. */
  private isServiceAccountJson(): boolean {
    return this.apiKey.trimStart().startsWith("{");
  }

  async testConnection(): Promise<boolean> {
    if (this.isServiceAccountJson()) {
      // Validate service-account JSON structure without making an HTTP call.
      // Real OAuth2 token exchange (JWT → access token) requires the google-auth-library
      // or manual RSA signing and is out of scope for the MVP connection test.
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(this.apiKey) as Record<string, unknown>;
      } catch {
        throw new Error("Vertex AI: service account credential is not valid JSON.");
      }
      if (!parsed["client_email"] || !parsed["private_key"]) {
        throw new Error(
          "Vertex AI: service account JSON is missing required fields: client_email, private_key.",
        );
      }
      return true;
    }

    // Treat as Bearer access token — we cannot call a project-less endpoint,
    // so we simply validate the token is non-empty.
    if (!this.apiKey.trim()) {
      throw new Error("Vertex AI: access token must not be empty.");
    }
    return true;
  }

  async listModels(): Promise<Array<{ id: string; name: string }>> {
    // Vertex AI model listing requires a GCP project ID and full OAuth2 scope.
    // We return a static list of the most common models to keep the MVP simple
    // and avoid coupling to a project-specific API call.
    return [
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
      { id: "gemini-1.0-pro", name: "Gemini 1.0 Pro" },
      { id: "text-bison", name: "PaLM 2 Text Bison" },
      { id: "code-bison", name: "PaLM 2 Code Bison" },
    ];
  }
}
