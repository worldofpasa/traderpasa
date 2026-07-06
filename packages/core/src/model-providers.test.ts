import { describe, it, expect, vi } from "vitest";
import {
  testModelProviderConnection,
  ModelProviderCredentialNotFoundError,
} from "./model-providers.js";
import type { ModelProviderAdapter } from "@pasa-trader/adapters";
import type { PrismaClient } from "@pasa-trader/db";

vi.mock("./credentials.js", () => ({
  decryptCredentialSecret: vi.fn().mockReturnValue('{"apiKey":"sk-test"}'),
  getCredentialEncryptionKeyFromEnv: vi.fn().mockReturnValue(Buffer.alloc(32)),
}));

const MODEL_CREDENTIAL = { kind: "MODEL_PROVIDER" as const, provider: "openai" };

function makeDb(overrides: Partial<{ credentialFindFirst: ReturnType<typeof vi.fn> }> = {}) {
  return {
    credential: {
      findFirst: overrides.credentialFindFirst ?? vi.fn().mockResolvedValue(MODEL_CREDENTIAL),
    },
  } as unknown as PrismaClient;
}

function makeAdapter(ok = true): ModelProviderAdapter {
  return {
    provider: "openai",
    testConnection: vi.fn().mockResolvedValue({ ok, message: ok ? "Connected" : "Unauthorized", checkedAt: new Date() }),
    generateStructured: vi.fn(),
  };
}

describe("testModelProviderConnection", () => {
  it("returns ok=true when adapter reports connected", async () => {
    const adapter = makeAdapter(true);
    const db = makeDb();

    const result = await testModelProviderConnection(
      { credentialId: "cred-1", provider: "openai", userId: "user-1" },
      db,
      () => adapter,
    );

    expect(result.ok).toBe(true);
    expect(adapter.testConnection).toHaveBeenCalledWith({ credentialId: "cred-1", provider: "openai" });
  });

  it("returns ok=false when adapter reports failure", async () => {
    const adapter = makeAdapter(false);
    const db = makeDb();

    const result = await testModelProviderConnection(
      { credentialId: "cred-1", provider: "openai", userId: "user-1" },
      db,
      () => adapter,
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Unauthorized");
  });

  it("throws ModelProviderCredentialNotFoundError when credential missing", async () => {
    const db = makeDb({ credentialFindFirst: vi.fn().mockResolvedValue(null) });

    await expect(
      testModelProviderConnection(
        { credentialId: "missing", provider: "openai", userId: "user-1" },
        db,
        () => makeAdapter(),
      ),
    ).rejects.toBeInstanceOf(ModelProviderCredentialNotFoundError);
  });

  it("throws ModelProviderCredentialNotFoundError for non-MODEL_PROVIDER credential", async () => {
    const db = makeDb({
      credentialFindFirst: vi.fn().mockResolvedValue({ kind: "BROKER", provider: "alpaca" }),
    });

    await expect(
      testModelProviderConnection(
        { credentialId: "cred-1", provider: "openai", userId: "user-1" },
        db,
        () => makeAdapter(),
      ),
    ).rejects.toBeInstanceOf(ModelProviderCredentialNotFoundError);
  });

  it("works with anthropic provider", async () => {
    const adapter = makeAdapter(true);
    const db = makeDb({
      credentialFindFirst: vi.fn().mockResolvedValue({ kind: "MODEL_PROVIDER", provider: "anthropic" }),
    });

    const result = await testModelProviderConnection(
      { credentialId: "cred-2", provider: "anthropic", userId: "user-1" },
      db,
      () => adapter,
    );

    expect(result.ok).toBe(true);
  });
});
