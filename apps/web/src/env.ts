/**
 * Validates required environment variables at startup.
 * Call this once during server initialization (instrumentation.ts).
 * Throws with a descriptive message identifying each missing variable.
 */
export function assertRequiredEnv(): void {
  const missing: string[] = [];

  if (!process.env.DATABASE_URL) {
    missing.push("DATABASE_URL");
  }

  if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
    missing.push("CREDENTIAL_ENCRYPTION_KEY");
  } else {
    const key = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, "base64");
    if (key.length !== 32) {
      throw new Error(
        "CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key. " +
          `Current decoded length: ${key.length} bytes.`,
      );
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Server cannot start: required environment variable(s) are missing: ${missing.join(", ")}. ` +
        "Set them in your .env file or container environment before starting the server.",
    );
  }
}
