/**
 * Lightweight interface used by the onboarding/settings LLM provider UI.
 *
 * This is distinct from ModelProviderAdapter (which handles full inference
 * calls). LLMProvider is used only for:
 *   - testConnection() — verifying an API key is valid
 *   - listModels() — fetching the catalogue of available model IDs
 */
export interface LLMProvider {
  /** Verify that the configured credentials work.
   * Must throw on any error so the caller can surface a failure state. */
  testConnection(): Promise<boolean>;

  /** Retrieve the catalogue of models that the provider supports. */
  listModels(): Promise<Array<{ id: string; name: string }>>;
}
