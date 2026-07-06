import { getPrismaClient, type PrismaClient } from "@pasa-trader/db";
import { OpenAICompatibleModelAdapter, type ModelProviderAdapter, type ModelConnectionStatus } from "@pasa-trader/adapters";
import { modelProviderCredentialSecretSchema } from "@pasa-trader/schemas";
import { decryptCredentialSecret, getCredentialEncryptionKeyFromEnv } from "./credentials.js";

export class ModelProviderCredentialNotFoundError extends Error {
  constructor() {
    super("Model provider credential not found or does not belong to user.");
    this.name = "ModelProviderCredentialNotFoundError";
  }
}

async function resolveModelKeys(
  credentialId: string,
  userId: string,
  db: PrismaClient,
): Promise<{ apiKey: string; baseUrl?: string | undefined; model?: string | undefined }> {
  const credential = await db.credential.findFirst({
    where: { id: credentialId, userId },
    select: { iv: true, encryptedPayload: true, authTag: true, kind: true, provider: true },
  });
  if (!credential) throw new ModelProviderCredentialNotFoundError();
  if (credential.kind !== "MODEL_PROVIDER") {
    throw new ModelProviderCredentialNotFoundError();
  }
  const secret = decryptCredentialSecret(
    { iv: credential.iv, encryptedPayload: credential.encryptedPayload, authTag: credential.authTag },
    getCredentialEncryptionKeyFromEnv(),
  );
  return modelProviderCredentialSecretSchema.parse(JSON.parse(secret));
}

function makeModelAdapter(provider: string, userId: string, db: PrismaClient): ModelProviderAdapter {
  return new OpenAICompatibleModelAdapter(provider, (credId) =>
    resolveModelKeys(credId, userId, db),
  );
}

export async function testModelProviderConnection(
  input: { credentialId: string; provider: string; userId: string },
  db: PrismaClient = getPrismaClient(),
  adapterFactory: (provider: string, userId: string, db: PrismaClient) => ModelProviderAdapter = makeModelAdapter,
): Promise<ModelConnectionStatus> {
  const credential = await db.credential.findFirst({
    where: { id: input.credentialId, userId: input.userId },
    select: { kind: true, provider: true },
  });
  if (!credential) throw new ModelProviderCredentialNotFoundError();
  if (credential.kind !== "MODEL_PROVIDER") {
    throw new ModelProviderCredentialNotFoundError();
  }

  const adapter = adapterFactory(input.provider, input.userId, db);
  return adapter.testConnection({ credentialId: input.credentialId, provider: input.provider });
}
