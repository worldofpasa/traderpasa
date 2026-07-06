import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getPrismaClient, type PrismaClient } from "@pasa-trader/db";
import {
  createCredentialRequestSchema,
  createCredentialResponseSchema,
  listCredentialsResponseSchema,
  type CreateCredentialRequest,
  type CreateCredentialResponse,
  type CredentialSummary,
  type ListCredentialsResponse,
} from "@pasa-trader/schemas";

const encryptionAlgorithm = "aes-256-gcm";
const keyVersion = "v1";

export class CredentialEncryptionKeyError extends Error {
  constructor() {
    super("A 32-byte credential encryption key is required.");
    this.name = "CredentialEncryptionKeyError";
  }
}

export function getCredentialEncryptionKeyFromEnv(): Buffer {
  return parseCredentialEncryptionKey(process.env.CREDENTIAL_ENCRYPTION_KEY);
}

export function parseCredentialEncryptionKey(value: string | undefined): Buffer {
  if (!value) {
    throw new CredentialEncryptionKeyError();
  }

  const key = Buffer.from(value, "base64");

  if (key.length !== 32) {
    throw new CredentialEncryptionKeyError();
  }

  return key;
}

export function encryptCredentialSecret(
  secret: string,
  key: Buffer,
): {
  authTag: string;
  encryptedPayload: string;
  iv: string;
} {
  if (key.length !== 32) {
    throw new CredentialEncryptionKeyError();
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(encryptionAlgorithm, key, iv);
  const encryptedPayload = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);

  return {
    authTag: cipher.getAuthTag().toString("base64"),
    encryptedPayload: encryptedPayload.toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptCredentialSecret(
  encrypted: {
    authTag: string;
    encryptedPayload: string;
    iv: string;
  },
  key: Buffer,
): string {
  if (key.length !== 32) {
    throw new CredentialEncryptionKeyError();
  }

  const decipher = createDecipheriv(encryptionAlgorithm, key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.encryptedPayload, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function toCredentialSummary(input: {
  createdAt: Date;
  id: string;
  keyVersion: string;
  kind: CredentialSummary["kind"];
  label: string;
  provider: string;
  updatedAt: Date;
}): CredentialSummary {
  return {
    id: input.id,
    kind: input.kind,
    provider: input.provider,
    label: input.label,
    keyVersion: input.keyVersion,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

export async function listCredentialsForUser(
  userId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<ListCredentialsResponse> {
  const credentials = await db.credential.findMany({
    where: {
      userId,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      kind: true,
      provider: true,
      label: true,
      keyVersion: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return listCredentialsResponseSchema.parse({
    credentials: credentials.map(toCredentialSummary),
  });
}

export async function createEncryptedCredential(
  input: CreateCredentialRequest & { userId: string },
  db: PrismaClient = getPrismaClient(),
): Promise<CreateCredentialResponse> {
  const parsedInput = createCredentialRequestSchema.parse(input);
  const encrypted = encryptCredentialSecret(
    parsedInput.secret,
    getCredentialEncryptionKeyFromEnv(),
  );

  const credential = await db.$transaction(async (transaction) => {
    const createdCredential = await transaction.credential.create({
      data: {
        userId: input.userId,
        kind: parsedInput.kind,
        provider: parsedInput.provider,
        label: parsedInput.label,
        keyVersion,
        ...encrypted,
      },
      select: {
        id: true,
        kind: true,
        provider: true,
        label: true,
        keyVersion: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorType: "USER",
        actorId: input.userId,
        action: "credential.created",
        target: `credential:${createdCredential.id}`,
        metadata: {
          kind: createdCredential.kind,
          provider: createdCredential.provider,
        },
      },
    });

    return createdCredential;
  });

  return createCredentialResponseSchema.parse({
    credential: toCredentialSummary(credential),
  });
}

export async function deleteCredential(
  input: { credentialId: string; userId: string },
  db: PrismaClient = getPrismaClient(),
): Promise<void> {
  const credential = await db.credential.findFirst({
    where: { id: input.credentialId, userId: input.userId },
    select: { id: true, kind: true, provider: true },
  });

  if (!credential) {
    throw new Error("Credential not found.");
  }

  await db.$transaction(async (tx) => {
    await tx.credential.delete({ where: { id: input.credentialId } });

    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: input.userId,
        action: "credential.deleted",
        target: `credential:${input.credentialId}`,
        metadata: { kind: credential.kind, provider: credential.provider },
      },
    });
  });
}
